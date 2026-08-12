import { z } from '../validation/zod';
import { isValidAwsConsoleRole } from '../domain/aws-console-role';
import type {
  RooBaseAccount,
  RooConfigV1,
  RooConfigV2,
  RooConfigV2Organizations,
  RooConfigDocument,
  RooOrganization,
  RooProject,
  RooDefaults,
} from './types';

const asciiControlCharacters = /[\u0000-\u001F\u007F]/;

const identifierSchema = z
  .string()
  .refine((value) => !asciiControlCharacters.test(value), {
    message: 'Identifiers must not contain ASCII control characters.',
  })
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, {
    message: 'Identifiers must contain a non-whitespace character.',
  });

const rolePathSchema = z.string().refine(isValidAwsConsoleRole, {
  message: 'Roles must be valid AWS Console role paths.',
});

const accountIdSchema = z.string().regex(/^\d{12}$/, {
  message: 'AWS account IDs must contain exactly 12 decimal digits.',
});

const accountAliasSchema = z
  .string()
  .min(3, 'Account aliases must contain 3–63 characters.')
  .max(63, 'Account aliases must contain 3–63 characters.')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message:
      'Account aliases must use lowercase ASCII letters, digits, and hyphens and have an alphanumeric boundary.',
  });

const additionalRoleSchema = z
  .object({
    environments: z.array(identifierSchema).optional(),
  })
  .strict();

const projectSchema = z
  .object({
    accounts: z.record(z.string(), accountIdSchema),
    roles: z.record(z.string(), additionalRoleSchema).default({}),
  })
  .strict();

const defaultsSchema = z
  .object({
    enabled: z.boolean().optional(),
    roles: z.array(rolePathSchema).optional(),
  })
  .strict();

const baseAccountSchema = z
  .object({
    account_id: accountIdSchema,
    account_alias: accountAliasSchema.optional(),
  })
  .strict();

const organizationSchema = z
  .object({
    base_accounts: z.array(baseAccountSchema).min(1, 'At least one base account is required.'),
    defaults: defaultsSchema.optional(),
    projects: z.record(z.string(), projectSchema),
  })
  .strict();

const rawRooConfigSchema = z
  .object({
    version: z.literal(1),
    defaults: defaultsSchema.optional(),
    projects: z.record(z.string(), projectSchema),
  })
  .strict();

const rawRooConfigV2Schema = z
  .object({
    version: z.literal(2),
    defaults: defaultsSchema.optional(),
    projects: z.record(z.string(), projectSchema).optional(),
    organizations: z.record(z.string(), organizationSchema).optional(),
    organisations: z.record(z.string(), organizationSchema).optional(),
  })
  .strict();

const normalizedDefaultsSchema = z
  .object({
    enabled: z.boolean(),
    roles: z.array(rolePathSchema),
  })
  .strict();

const normalizedProjectSchema = z
  .object({
    accounts: z.record(z.string(), accountIdSchema),
    roles: z.record(z.string(), additionalRoleSchema),
  })
  .strict();

const normalizedOrganizationSchema = z
  .object({
    baseAccounts: z.array(z.object({
      accountId: accountIdSchema,
      accountAlias: accountAliasSchema.optional(),
    }).strict()).min(1),
    defaults: normalizedDefaultsSchema,
    projects: z.record(z.string(), normalizedProjectSchema),
  })
  .strict();

const normalizedRooConfigV2OrganizationsSchema = z
  .object({
    version: z.literal(2),
    organizations: z.record(z.string(), normalizedOrganizationSchema),
  })
  .strict()
  .transform((config): RooConfigV2Organizations => config);

type IssueContext = z.RefinementCtx;
type ParsedDefaults = z.output<typeof defaultsSchema>;
type ParsedProject = z.output<typeof projectSchema>;
type ParsedOrganization = z.output<typeof organizationSchema>;

function parseIdentifier(value: string): string | undefined {
  const result = identifierSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function parseRolePath(value: string): string | undefined {
  const result = rolePathSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function addIssue(context: IssueContext, path: (string | number)[], message: string) {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function validateNormalizedKeys(
  record: Record<string, unknown>,
  path: (string | number)[],
  parseKey: (value: string) => string | undefined,
  context: IssueContext,
) {
  const normalizedKeys = new Set<string>();

  for (const key of Object.keys(record)) {
    const normalizedKey = parseKey(key);

    if (!normalizedKey) {
      addIssue(context, [...path, key], 'Map keys must be valid normalized identifiers.');
      continue;
    }

    if (normalizedKeys.has(normalizedKey)) {
      addIssue(context, [...path, key], `Map key collides after normalization: ${normalizedKey}.`);
      continue;
    }

    normalizedKeys.add(normalizedKey);
  }

  return normalizedKeys;
}

function validateDefaults(
  defaults: ParsedDefaults | undefined,
  path: (string | number)[],
  context: IssueContext,
) {
  if (defaults?.enabled === true && (defaults.roles?.length ?? 0) === 0) {
    addIssue(
      context,
      [...path, 'roles'],
      'At least one default role is required when defaults are enabled.',
    );
  }
}

interface ProjectValidationOptions {
  scopeName?: string;
  baseAccountOwners?: ReadonlyMap<string, string>;
  organizationId?: string;
}

function validateProjects(
  projects: Record<string, ParsedProject>,
  projectsPath: (string | number)[],
  defaults: ParsedDefaults | undefined,
  accountLocations: Map<string, string>,
  accountNameLocations: Map<string, string>,
  context: IssueContext,
  options: ProjectValidationOptions = {},
) {
  validateDefaults(defaults, projectsPath.slice(0, -1).concat('defaults'), context);
  validateNormalizedKeys(projects, projectsPath, parseIdentifier, context);

  for (const [projectKey, project] of Object.entries(projects)) {
    const projectName = parseIdentifier(projectKey);
    const projectPath = [...projectsPath, projectKey];

    validateNormalizedKeys(project.accounts, [...projectPath, 'accounts'], parseIdentifier, context);
    validateNormalizedKeys(project.roles, [...projectPath, 'roles'], parseRolePath, context);

    const environments = new Set(
      Object.keys(project.accounts)
        .map(parseIdentifier)
        .filter((environment): environment is string => environment !== undefined),
    );

    for (const [environment, accountId] of Object.entries(project.accounts)) {
      const normalizedEnvironment = parseIdentifier(environment);

      if (!normalizedEnvironment) {
        continue;
      }

      const locationName = `${projectName ?? projectKey}/${normalizedEnvironment}`;
      const location = options.scopeName ? `${options.scopeName}/${locationName}` : locationName;
      const baseAccountOwner = options.baseAccountOwners?.get(accountId);

      if (baseAccountOwner !== undefined && baseAccountOwner !== options.organizationId) {
        addIssue(
          context,
          [...projectPath, 'accounts', environment],
          `Base account ID ${accountId} belongs to organization ${baseAccountOwner}.`,
        );
      }

      const previousLocation = accountLocations.get(accountId);

      if (previousLocation) {
        addIssue(
          context,
          [...projectPath, 'accounts', environment],
          `AWS account ID ${accountId} is already used at ${previousLocation}.`,
        );
      } else {
        accountLocations.set(accountId, location);
      }

      const accountName = `${projectName ?? projectKey}-${normalizedEnvironment}`;
      const previousNameLocation = accountNameLocations.get(accountName);

      if (previousNameLocation) {
        addIssue(
          context,
          [...projectPath, 'accounts', environment],
          `Generated account name ${accountName} is already used at ${previousNameLocation}.`,
        );
      } else {
        accountNameLocations.set(accountName, location);
      }
    }

    for (const [roleKey, role] of Object.entries(project.roles)) {
      if (!role.environments) {
        continue;
      }

      for (const [index, environment] of role.environments.entries()) {
        if (!environments.has(environment)) {
          addIssue(
            context,
            [...projectPath, 'roles', roleKey, 'environments', index],
            `Environment ${environment} must exist in the project's accounts map.`,
          );
        }
      }
    }
  }
}

function normalizeDefaults(defaults: ParsedDefaults | undefined): RooDefaults {
  const configuredDefaultRoles = defaults?.roles ?? [];

  return {
    enabled: defaults?.enabled ?? configuredDefaultRoles.length > 0,
    roles: [...configuredDefaultRoles],
  };
}

function normalizeProjects(projects: Record<string, ParsedProject>): Record<string, RooProject> {
  return Object.fromEntries(
    Object.entries(projects).map(([projectKey, project]) => [
      identifierSchema.parse(projectKey),
      {
        accounts: Object.fromEntries(
          Object.entries(project.accounts).map(([environment, accountId]) => [
            identifierSchema.parse(environment),
            accountId,
          ]),
        ),
        roles: Object.fromEntries(
          Object.entries(project.roles).map(([roleKey, role]) => [rolePathSchema.parse(roleKey), role]),
        ),
      },
    ]),
  );
}

function normalizeConfig(config: z.output<typeof rawRooConfigSchema>): RooConfigV1 {
  return {
    version: 1,
    defaults: normalizeDefaults(config.defaults),
    projects: normalizeProjects(config.projects),
  };
}

function validateConfig(config: z.output<typeof rawRooConfigSchema>, context: IssueContext) {
  validateProjects(
    config.projects,
    ['projects'],
    config.defaults,
    new Map<string, string>(),
    new Map<string, string>(),
    context,
  );
}

export const rooConfigV1Schema = rawRooConfigSchema
  .superRefine(validateConfig)
  .transform(normalizeConfig);

function validateOrganizationOwnership(
  organizations: Record<string, ParsedOrganization>,
  organizationPath: string,
  context: IssueContext,
) {
  const baseAccountOwners = new Map<string, string>();
  const baseAccountAliasOwners = new Map<string, string>();

  for (const [organizationKey, organization] of Object.entries(organizations)) {
    for (const [index, baseAccount] of organization.base_accounts.entries()) {
      const previousOwner = baseAccountOwners.get(baseAccount.account_id);

      if (previousOwner !== undefined) {
        addIssue(
          context,
          [organizationPath, organizationKey, 'base_accounts', index, 'account_id'],
          `Base account ID ${baseAccount.account_id} is already owned by organization ${previousOwner}.`,
        );
      } else {
        baseAccountOwners.set(baseAccount.account_id, organizationKey);
      }

      if (baseAccount.account_alias !== undefined) {
        const previousAliasOwner = baseAccountAliasOwners.get(baseAccount.account_alias);

        if (previousAliasOwner !== undefined) {
          addIssue(
            context,
            [organizationPath, organizationKey, 'base_accounts', index, 'account_alias'],
            `Base account alias ${baseAccount.account_alias} is already owned by organization ${previousAliasOwner}.`,
          );
        } else {
          baseAccountAliasOwners.set(baseAccount.account_alias, organizationKey);
        }
      }
    }
  }

  const projectAccountLocations = new Map<string, string>();

  for (const [organizationKey, organization] of Object.entries(organizations)) {
    validateProjects(
      organization.projects,
      [organizationPath, organizationKey, 'projects'],
      organization.defaults,
      projectAccountLocations,
      new Map<string, string>(),
      context,
      {
        scopeName: organizationKey,
        baseAccountOwners,
        organizationId: organizationKey,
      },
    );
  }
}

function validateConfigV2(config: z.output<typeof rawRooConfigV2Schema>, context: IssueContext) {
  const hasProjects = config.projects !== undefined;
  const hasOrganizations = config.organizations !== undefined;
  const hasOrganisations = config.organisations !== undefined;

  if (hasProjects && hasOrganizations) {
    addIssue(context, ['projects'], 'Simple Mode cannot also define organizations.');
  }

  if (hasProjects && hasOrganisations) {
    addIssue(context, ['projects'], 'Simple Mode cannot also define organisations.');
  }

  if (hasOrganizations && hasOrganisations) {
    addIssue(context, ['organizations'], 'Use only one organization spelling.');
  }

  if (!hasProjects && !hasOrganizations && !hasOrganisations) {
    addIssue(context, [], 'Config v2 must define projects or organizations.');
    return;
  }

  if (hasProjects) {
    validateProjects(
      config.projects ?? {},
      ['projects'],
      config.defaults,
      new Map<string, string>(),
      new Map<string, string>(),
      context,
    );
    return;
  }

  if (config.defaults !== undefined) {
    addIssue(context, ['defaults'], 'Organization Mode does not allow top-level defaults.');
  }

  const organizationPath = hasOrganizations ? 'organizations' : 'organisations';
  const organizations = config.organizations ?? config.organisations;

  if (!organizations) {
    return;
  }

  validateNormalizedKeys(organizations, [organizationPath], parseIdentifier, context);
  validateOrganizationOwnership(organizations, organizationPath, context);
}

function normalizeBaseAccount(baseAccount: z.output<typeof baseAccountSchema>): RooBaseAccount {
  return {
    accountId: baseAccount.account_id,
    ...(baseAccount.account_alias === undefined
      ? {}
      : { accountAlias: baseAccount.account_alias }),
  };
}

function normalizeOrganization(
  organization: ParsedOrganization,
): RooOrganization {
  return {
    baseAccounts: organization.base_accounts.map(normalizeBaseAccount),
    defaults: normalizeDefaults(organization.defaults),
    projects: normalizeProjects(organization.projects),
  };
}

function normalizeConfigV2(config: z.output<typeof rawRooConfigV2Schema>): RooConfigV2 {
  if (config.projects !== undefined) {
    return {
      version: 2,
      defaults: normalizeDefaults(config.defaults),
      projects: normalizeProjects(config.projects),
    };
  }

  const organizations = config.organizations ?? config.organisations;

  if (organizations === undefined) {
    throw new Error('Config v2 must define projects or organizations.');
  }

  return {
    version: 2,
    organizations: Object.fromEntries(
      Object.entries(organizations).map(([organizationKey, organization]) => [
        identifierSchema.parse(organizationKey),
        normalizeOrganization(organization),
      ]),
    ),
  };
}

export function normalizeRooConfig(input: unknown): RooConfigV1 {
  return rooConfigV1Schema.parse(input);
}

export const rooConfigV2Schema = rawRooConfigV2Schema
  .superRefine(validateConfigV2)
  .transform(normalizeConfigV2);

export function normalizeRooConfigV2(input: unknown): RooConfigV2 {
  return rooConfigV2Schema.parse(input);
}

export const rooConfigDocumentSchema = z.union([
  rooConfigV1Schema,
  rooConfigV2Schema,
  normalizedRooConfigV2OrganizationsSchema,
]);

export function normalizeRooConfigDocument(input: unknown): RooConfigDocument {
  try {
    return rooConfigDocumentSchema.parse(input);
  } catch (error) {
    if (typeof input === 'object' && input !== null && 'version' in input) {
      const version = (input as { version?: unknown }).version;

      if (version === 1) {
        return rooConfigV1Schema.parse(input);
      }

      if (version === 2) {
        return rooConfigV2Schema.parse(input);
      }
    }

    throw error;
  }
}

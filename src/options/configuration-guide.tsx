export const SIMPLE_CONFIGURATION_EXAMPLE: string = `version: 1

defaults:
  enabled: true
  roles:
    - platform/read-only

projects:
  atlas:
    accounts:
      dev: "111111111111"
      prod: "222222222222"

    roles:
      platform/data-engineer:
        environments:
          - prod
`;

export const ORGANIZATION_CONFIGURATION_EXAMPLE: string = `version: 2

organizations:
  engineering:
    base_accounts:
      - account_id: "111111111111"
        account_alias: engineering-root

    defaults:
      enabled: true
      roles:
        - platform/read-only

    projects:
      atlas:
        accounts:
          prod: "222222222222"

        roles:
          platform/data-engineer: {}
`;

export default function ConfigurationGuide() {
  return (
    <div className="configuration-guide">
      <h3>Configuration YAML Reference</h3>

      <section className="configuration-guide-section">
        <h4>Files and lifecycle</h4>
        <p>Roo owns one current Configuration.</p>
        <p>
          New creates a Roo-created canonical YAML draft named <code>roo.yaml</code>.
        </p>
        <p>
          Upload accepts <code>.yaml</code>, <code>.yml</code>, and <code>.json</code>.
          JSON is accepted as input; the editor always uses canonical YAML. Upload
          comments and source formatting are not retained.
        </p>
        <p>
          Selecting Replace file does not persist immediately. Save configuration
          is required.
        </p>
        <dl>
          <dt>Created Configuration</dt>
          <dd>Edit or Replace. Clear is available inside Edit and requires Save.</dd>
          <dt>Uploaded Configuration</dt>
          <dd>Edit, Replace, or Delete.</dd>
        </dl>
        <p>
          Delete removes Roo&apos;s persisted copy only. It does not delete the
          original local file.
        </p>
      </section>

      <section className="configuration-guide-section">
        <h4>Version 1 — Simple Mode</h4>
        <pre aria-label="Version 1 configuration example"><code>{SIMPLE_CONFIGURATION_EXAMPLE}</code></pre>
        <p>
          Public fields are <code>version</code>, <code>defaults</code>,{' '}
          <code>defaults.enabled</code>, <code>defaults.roles</code>,{' '}
          <code>projects</code>, <code>accounts</code>, <code>roles</code>, and{' '}
          <code>environments</code>.
        </p>
        <ul>
          <li><code>defaults</code> is optional.</li>
          <li>
            If <code>defaults.roles</code> is non-empty and <code>enabled</code> is
            omitted, Roo treats the defaults as enabled.
          </li>
          <li><code>enabled: false</code> disables default roles.</li>
          <li><code>enabled: true</code> with no default roles is invalid.</li>
          <li><code>projects</code> is a map of project names.</li>
          <li><code>accounts</code> maps environment names to AWS account IDs.</li>
          <li>A role without <code>environments</code> applies to every account in that project.</li>
          <li>
            A role with <code>environments</code> applies only to the listed
            environments. Every listed environment must exist in that project&apos;s{' '}
            <code>accounts</code> map.
          </li>
          <li>An account with no applicable role is valid and produces no destination.</li>
        </ul>
      </section>

      <section className="configuration-guide-section">
        <h4>Version 2 — Organization Mode</h4>
        <pre aria-label="Version 2 configuration example"><code>{ORGANIZATION_CONFIGURATION_EXAMPLE}</code></pre>
        <p>
          Public fields are <code>organizations</code>, <code>base_accounts</code>,{' '}
          <code>account_id</code>, <code>account_alias</code>, <code>defaults</code>,{' '}
          <code>projects</code>, <code>accounts</code>, <code>roles</code>, and{' '}
          <code>environments</code>.
        </p>
        <ul>
          <li>Each organization requires at least one <code>base_accounts</code> entry.</li>
          <li><code>account_id</code> is an exact 12-digit AWS account ID.</li>
          <li><code>account_alias</code> is optional.</li>
          <li><code>base_accounts</code> identify which organization owns the active AWS context.</li>
          <li>
            A base account does not become a Jump destination merely because it
            appears in <code>base_accounts</code>.
          </li>
          <li>
            Projects and roles inside an organization use the same project
            structure shown in Version 1.
          </li>
          <li>Organization ownership must remain unambiguous.</li>
        </ul>
        <p>
          <code>organisations</code> is accepted as an input spelling. Canonical YAML
          always writes <code>organizations</code>.
        </p>
      </section>

      <section className="configuration-guide-section">
        <h4>Identifiers and AWS accounts</h4>
        <ul>
          <li>Project, environment, and organization names are trimmed.</li>
          <li>They must contain at least one non-whitespace character.</li>
          <li>ASCII control characters are rejected.</li>
          <li>Two keys that become identical after normalization are invalid.</li>
          <li>An AWS account ID is exactly 12 decimal digits.</li>
        </ul>
        <p><code>account_alias</code> must:</p>
        <ul>
          <li>contain 3–63 characters;</li>
          <li>use lowercase ASCII letters, digits, and hyphens; and</li>
          <li>start and end with an alphanumeric character.</li>
        </ul>
      </section>

      <section className="configuration-guide-section">
        <h4>Role syntax</h4>
        <ul>
          <li>The complete role path/name is at most 64 characters.</li>
          <li>It must not be empty.</li>
          <li>Path segments are separated by <code>/</code>.</li>
          <li>No leading <code>/</code>, trailing <code>/</code>, or empty path segment.</li>
          <li>No whitespace or ASCII control characters.</li>
          <li>Path segments must contain printable ASCII characters.</li>
        </ul>
        <p>
          The final AWS RoleName uses only: <code>A-Z</code>, <code>a-z</code>,{' '}
          <code>0-9</code>, <code>_</code>, <code>+</code>, <code>=</code>,{' '}
          <code>,</code>, <code>.</code>, <code>@</code>, and <code>-</code>.
        </p>
      </section>

      <section className="configuration-guide-section">
        <h4>Search and AWS context</h4>
        <ul>
          <li>Search begins after 3 characters.</li>
          <li>Search is local.</li>
          <li>Version 1 Simple Mode does not need organization resolution.</li>
          <li>
            Version 2 Organization Mode scopes results using the current supported
            AWS Console tab.
          </li>
          <li>Roo supports the configured commercial AWS Console host set only.</li>
        </ul>
      </section>
    </div>
  );
}

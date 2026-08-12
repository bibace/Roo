import { forwardRef, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { JumpTarget } from '../domain/jump-target';

export interface ResultRowProps {
  target: JumpTarget;
  isActive: boolean;
  scrollAccountName: boolean;
  onActivate: (target: JumpTarget) => void | Promise<void>;
  onMouseMove: () => void;
}

function isAdminRole(roleShortName: string): boolean {
  return roleShortName.trim().toLowerCase().endsWith('admin');
}

const ResultRow = forwardRef<HTMLButtonElement, ResultRowProps>(function ResultRow(
  { target, isActive, scrollAccountName, onActivate, onMouseMove },
  ref,
) {
  const adminRole = isAdminRole(target.roleShortName);
  const accountNameViewportRef = useRef<HTMLSpanElement>(null);
  const accountNameTextRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const accountNameViewport = accountNameViewportRef.current;
    const accountNameText = accountNameTextRef.current;

    if (!accountNameViewport || !accountNameText) {
      return;
    }

    setOverflowDistance(Math.round(
      Math.max(0, accountNameText.scrollWidth - accountNameViewport.clientWidth),
    ));
  }, [target.accountName, target.roleShortName]);

  const isOverflowing = overflowDistance > 0;
  const accountNameStyle = {
    '--roo-account-name-shift': '-' + overflowDistance + 'px',
  } as CSSProperties;

  return (
    <button
      ref={ref}
      className="result-row"
      type="button"
      data-active={isActive ? 'true' : 'false'}
      onClick={() => {
        void onActivate(target);
      }}
      onMouseMove={onMouseMove}
    >
      <span className="result-account-id">{target.accountId}</span>
      <span
        ref={accountNameViewportRef}
        className="result-account-name"
        title={target.accountName}
        data-overflowing={isOverflowing ? 'true' : 'false'}
        data-scrolling={scrollAccountName && isOverflowing ? 'true' : 'false'}
        style={accountNameStyle}
      >
        <span ref={accountNameTextRef} className="result-account-name-text">
          {target.accountName}
        </span>
      </span>
      <span
        className={adminRole ? 'result-role result-role--admin' : 'result-role'}
        data-admin={adminRole ? 'true' : 'false'}
      >
        {target.roleShortName}
      </span>
    </button>
  );
});

export default ResultRow;

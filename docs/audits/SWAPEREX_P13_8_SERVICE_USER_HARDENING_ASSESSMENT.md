# SWAPEREX P13.8 — Service User Hardening Assessment

**Verdict:** `P13_8_SERVICE_USER_MIGRATION_REQUIRES_RELOCATION`  
**Date:** 2026-07-10 UTC  
**Assessor:** Read-only feasibility review (no migration performed)

---

## Current state

| Item | Value |
|------|-------|
| Installed unit | `/etc/systemd/system/swaperex-route-quote-smoke.service` |
| Execution user | `root` |
| WorkingDirectory | `/root/Swaperex` |
| Lock file | `/var/lock/swaperex-route-quote-smoke.lock` |
| Report output | `/root/Swaperex/reports/p13/route-smoke/` |
| Node binary | `/usr/bin/node` |
| Browser | Playwright Chromium (P12.5 smoke) |

---

## File and directory requirements

### Read access

| Path | Purpose |
|------|---------|
| `/root/Swaperex/scripts/audit/p12-5-route-quote-regression-smoke.mjs` | Certified smoke |
| `/root/Swaperex/scripts/ops/p13-run-route-quote-smoke.mjs` | Wrapper |
| `/root/Swaperex/scripts/audit/config/p12-runtime-warning-baseline.json` | Route matrix (indirect) |
| `/root/Swaperex/node_modules/` (Playwright) | Browser launch |
| `/root/Swaperex/frontend/node_modules/` | Possible transitive deps |

### Write access

| Path | Purpose |
|------|---------|
| `/root/Swaperex/reports/p13/route-smoke/` | Timestamped JSON |
| `/var/lock/swaperex-route-quote-smoke.lock` | flock overlap protection |
| `$HOME/.cache/ms-playwright/` or `$XDG_CACHE_HOME` | Chromium browser cache |
| `/tmp` | Browser sandbox temp |

### Must NOT require

- Application source write access
- `.env` / production secrets
- Wallet keys or signing capabilities
- Git write access

---

## `/root` traversal blocker

A dedicated user `swaperex-monitor` **cannot** access `/root/Swaperex` by default on Linux (`ProtectHome=true`, directory mode `700`). Options evaluated:

| Option | Feasibility | Notes |
|--------|-------------|-------|
| **A. Root + systemd sandboxing** | Partial | Can add `NoNewPrivileges`, `PrivateTmp`, `RestrictAddressFamilies`; Chromium may break under `MemoryDenyWriteExecute` or strict `ProtectSystem` |
| **B. Move tools to `/opt/swaperex-monitor`** | **Preferred long-term** | Copy or symlink scripts + own `node_modules`; reports under `/var/lib/swaperex-monitor/reports/` |
| **C. Narrow ACL on `/root/Swaperex` for one user** | Risky | Weakens `/root` isolation; not recommended |
| **D. Immutable monitoring bundle** | Good | Tar/deploy read-only bundle to `/opt`; writable reports dir only |

---

## Systemd hardening compatibility (Chromium)

| Directive | Safe to enable now? | Notes |
|-----------|---------------------|-------|
| `NoNewPrivileges=true` | Likely yes | Test with manual smoke run |
| `PrivateTmp=true` | Likely yes | Browser uses private /tmp |
| `ProtectSystem=strict` | **Risky** | May block Playwright browser binary paths |
| `ProtectHome=true` | **Blocks current layout** | Conflicts with `/root/Swaperex` |
| `ProtectKernelTunables=true` | Likely yes | |
| `ProtectKernelModules=true` | Likely yes | |
| `ProtectControlGroups=true` | Likely yes | |
| `RestrictSUIDSGID=true` | Likely yes | |
| `LockPersonality=true` | Test required | |
| `MemoryDenyWriteExecute=true` | **Likely breaks Chromium** | Do not enable without testing |
| `CapabilityBoundingSet=` | Partial | May need `CAP_SYS_ADMIN` for sandbox (verify) |
| `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6` | Likely yes | Smoke needs HTTPS + RPC |
| `ReadWritePaths=/var/lib/swaperex-monitor` | Future | After relocation |

**Recommendation:** Do not apply aggressive sandboxing to the root service until Playwright compatibility is tested in a staging unit.

---

## Minimum permissions for `swaperex-monitor` (future)

```text
User: swaperex-monitor
Group: swaperex-monitor
Home: /var/lib/swaperex-monitor
Read: /opt/swaperex-monitor (scripts, node_modules)
Write: /var/lib/swaperex-monitor/reports/p13/
Write: /run/swaperex-monitor/ (lock file alternative to /var/lock)
No access: /root, .env*, wallet material, application deploy keys
```

---

## Migration prerequisites (not yet met)

1. Relocate monitoring bundle out of `/root` **or** grant explicit non-root path
2. Dedicated writable report directory outside application tree
3. Playwright browser install owned by service user
4. Update unit `WorkingDirectory`, `ExecStart`, `ReadWritePaths`
5. Successful manual + scheduled smoke as non-root (3 consecutive passes)
6. Rollback unit files documented

---

## Interim acceptance

Running as **root** is **temporarily accepted** because:

- Repository lives under `/root/Swaperex`
- No migration prerequisites proven
- Current smoke passes; timer active
- Service is read-only against production (no deploy/signing)

**Do not** auto-migrate without completing relocation plan.

---

## Preferred long-term direction

```text
Dedicated service user (swaperex-monitor)
Monitoring bundle at /opt/swaperex-monitor
Reports at /var/lib/swaperex-monitor/reports/
No write access to application source
No access to secrets
Tested systemd sandbox (NoNewPrivileges, PrivateTmp, RestrictAddressFamilies)
```

---

## Verdict rationale

```text
P13_8_SERVICE_USER_MIGRATION_REQUIRES_RELOCATION
```

Root service is acceptable interim state. Migration requires moving the monitoring bundle out of `/root` before `swaperex-monitor` can run safely.

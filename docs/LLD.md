# Low-Level Design — User Payout Management System

This document complements the [README](../README.md) with deeper design reasoning, the domain
state machines, and sequence diagrams for each core flow.

---

## 1. Domain Overview

Three moving parts drive every balance change:

- **Sale** — an affiliate commission moving through `pending → approved | rejected`.
- **Payout** — an actual money movement to the user, either an `ADVANCE` (system-initiated) or a
  `WITHDRAWAL` (user-initiated), each with its own status lifecycle.
- **LedgerEntry** — an immutable, signed record of every change to the user's withdrawable balance.

The **withdrawable balance** is a *derived* quantity: `SUM(LedgerEntry.amount)`. Nothing overwrites
a running total, which removes an entire class of concurrency bugs and makes the balance auditable.

---

## 2. State Machines

### Sale

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> approved : reconcile(approved)  → ledger += (earning − advance)
  pending --> rejected : reconcile(rejected)  → ledger += (−advance)
  approved --> [*]
  rejected --> [*]
```

`reconciledAt` is set on the transition, so a second reconcile attempt is rejected with `409 CONFLICT`.

### Payout

```mermaid
stateDiagram-v2
  [*] --> INITIATED
  INITIATED --> SUCCESS   : gateway confirms
  INITIATED --> FAILED    : gateway fails    → ledger += (+amount)  [reversal]
  INITIATED --> CANCELLED : gateway cancels  → ledger += (+amount)  [reversal]
  INITIATED --> REJECTED  : gateway rejects  → ledger += (+amount)  [reversal]
```

An `ADVANCE` payout is written directly as `SUCCESS` (it is transferred immediately). A `WITHDRAWAL`
payout starts `INITIATED` and can transition exactly once — the transaction that flips it out of
`INITIATED` also writes the reversal, guaranteeing at-most-once recovery.

---

## 3. Money Model

- Unit of account: **integer paise** (`₹1 = 100 paise`). All arithmetic is exact integer math.
- Advance: `floor(earning_paise × 10 / 100)`. Flooring ensures the platform never over-pays a
  fractional paise on a fractional percentage.
- API boundary: requests accept **rupees** (matching the reference data); responses expose both
  `paise` (exact) and `rupees` (human-friendly).

---

## 4. Core Flows (Sequence Diagrams)

### 4.1 Advance Payout (idempotent)

```mermaid
sequenceDiagram
  participant J as Advance Job
  participant S as advancePayoutService
  participant DB as Prisma/SQLite
  J->>S: runAdvancePayouts(userId)
  S->>DB: find pending sales where advancePaidAt is null
  loop each eligible sale
    S->>DB: BEGIN TX
    S->>DB: INSERT Payout(ADVANCE, key="advance:<saleId>")
    alt duplicate key (P2002)
      DB-->>S: unique violation → skip (already paid)
    else success
      S->>DB: UPDATE sale.advanceAmount, advancePaidAt
      S->>DB: COMMIT
    end
  end
  S-->>J: { processed, skipped, totalAdvance }
```

### 4.2 Reconciliation

```mermaid
sequenceDiagram
  participant A as Admin
  participant S as reconciliationService
  participant DB as Prisma/SQLite
  A->>S: reconcile(saleId, status)
  S->>DB: BEGIN TX
  S->>DB: load sale (must be pending & not reconciled)
  alt approved
    S->>DB: INSERT LedgerEntry(+ (earning − advance))
  else rejected
    S->>DB: INSERT LedgerEntry(− advance)
  end
  S->>DB: UPDATE sale.status, reconciledAt
  S->>DB: COMMIT
```

### 4.3 Withdrawal (24h rule)

```mermaid
sequenceDiagram
  participant U as User
  participant S as withdrawalService
  participant DB as Prisma/SQLite
  U->>S: initiateWithdrawal(userId, amount?)
  S->>DB: BEGIN TX
  S->>DB: recent withdrawal (INITIATED|SUCCESS) in last 24h?
  alt exists
    S-->>U: 429 RATE_LIMITED
  else none
    S->>DB: balance = SUM(ledger)
    alt amount > balance or balance ≤ 0
      S-->>U: 422 INSUFFICIENT_BALANCE
    else
      S->>DB: INSERT Payout(WITHDRAWAL, INITIATED)
      S->>DB: INSERT LedgerEntry(− amount, WITHDRAWAL_DEBIT)
      S->>DB: COMMIT
      S-->>U: 201 payout
    end
  end
```

### 4.4 Failed Payout Recovery

```mermaid
sequenceDiagram
  participant G as Payment Gateway
  participant S as payoutRecoveryService
  participant DB as Prisma/SQLite
  G->>S: POST /payouts/:id/status { failed }
  S->>DB: BEGIN TX
  S->>DB: load payout
  alt status ≠ INITIATED
    S-->>G: 409 CONFLICT (already terminal)
  else
    S->>DB: UPDATE payout.status = FAILED
    S->>DB: INSERT LedgerEntry(+ amount, PAYOUT_REVERSAL)
    S->>DB: COMMIT
    S-->>G: 200 (balance restored)
  end
```

---

## 5. Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `Sale` | `(userId, status)` | Fast lookup of a user's eligible/pending sales. |
| `Payout` | `(userId, type, createdAt)` | Efficient 24h-window withdrawal check. |
| `Payout` | `idempotencyKey` (unique) | Enforces one advance per sale. |
| `LedgerEntry` | `(userId)` | Fast balance aggregation. |

---

## 6. Trade-offs & Production Evolution

- **Balance snapshots:** summing the ledger is O(entries). At scale, maintain a periodic
  `balance_snapshot` (checkpoint + delta) so reads stay O(1). The ledger remains the source of truth.
- **PostgreSQL:** swap the datasource `provider` to `postgresql`. The 24h check and withdrawal debit
  would use `SELECT … FOR UPDATE` on the user row to serialize concurrent withdrawals; SQLite already
  serializes writes, so the current guarantees hold for the assignment.
- **Outbox / async payouts:** real advance and withdrawal transfers are asynchronous. Here they are
  modeled synchronously (advance = immediate `SUCCESS`; withdrawal = `INITIATED` awaiting a gateway
  callback via `POST /payouts/:id/status`). An outbox table + worker would decouple the transfer from
  the request in production.
- **Idempotency keys for withdrawals:** advances use a deterministic key (`advance:<saleId>`).
  Withdrawals could accept a client-supplied idempotency key to make retries safe as well.

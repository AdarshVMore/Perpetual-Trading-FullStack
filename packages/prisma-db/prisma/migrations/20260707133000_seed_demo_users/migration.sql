-- Shared demo accounts for one-click platform access (Alice & Bob).
INSERT INTO "User" ("id", "email", "password", "role")
VALUES
  (
    'demo-user-alice-001',
    'demo_alice@perp.local',
    '$2b$10$ATHDdS.VJ074KkcW2djrFupvNq6KIYbjBaBNc9eDAKWbIfcqJd6jO',
    'user'
  ),
  (
    'demo-user-bob-002',
    'demo_bob@perp.local',
    '$2b$10$ATHDdS.VJ074KkcW2djrFupvNq6KIYbjBaBNc9eDAKWbIfcqJd6jO',
    'user'
  )
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "UserBalance" ("id", "userId", "availableBalance", "lockedBalance", "createdAt", "updatedAt")
SELECT
  'demo-balance-alice-001',
  'demo-user-alice-001',
  1000000,
  0,
  NOW(),
  NOW()
WHERE EXISTS (SELECT 1 FROM "User" WHERE "id" = 'demo-user-alice-001')
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "UserBalance" ("id", "userId", "availableBalance", "lockedBalance", "createdAt", "updatedAt")
SELECT
  'demo-balance-bob-002',
  'demo-user-bob-002',
  1000000,
  0,
  NOW(),
  NOW()
WHERE EXISTS (SELECT 1 FROM "User" WHERE "id" = 'demo-user-bob-002')
ON CONFLICT ("userId") DO NOTHING;

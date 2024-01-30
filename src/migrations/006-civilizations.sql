--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE civilizations (
  "id" integer NOT NULL CONSTRAINT "PK_civilizations" PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "emblem_key" text NOT NULL,
  "modification_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "creation_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP)
);

Insert Into civilizations ("key", "emblem_key") Values
('ptol', 'ptolemies'),
('cart', 'carthaginians'),
('han', 'han'),
('spart', 'spartans'),
('mace', 'macedonians'),
('rome', 'romans'),
('athen', 'athenians'),
('maur', 'mauryas'),
('sele', 'seleucids'),
('gaul', 'celts'),
('brit', 'celts'),
('iber', 'iberians'),
('kush', 'kushites'),
('pers', 'persians');

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE civilizations;

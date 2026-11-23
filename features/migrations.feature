Feature: The database migrations
  Numbered SQL files change the database once, in order, and never take data with them.

  Scenario: Every migration is applied once
    Given an empty database
    When the migrations are applied
    Then every migration file is recorded
    And applying them again does nothing

  Scenario: A database migrated by the earlier runner only gets the newer files
    Given a database migrated up to migration 12
    When the migrations are applied
    Then only the files after migration 12 are applied

  Scenario: A failing migration leaves nothing behind
    Given a migration that creates a table and then fails
    When the migrations are applied
    Then the migration is refused
    And neither its table nor a record of it exists

  Scenario: Rebuilding a parent table does not delete its children
    Given a child table that cascades from a parent table, holding one row each
    When a migration drops and recreates the parent table
    Then the child row is still there
    And foreign keys are on again

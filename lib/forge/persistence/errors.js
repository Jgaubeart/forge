// Shared error type for the persistence boundary.
//
// Deliberately dependency-free: the adapters import this instead of the
// server-only client module, so the mapping and repository logic stays directly
// testable while the server-only marker lives only on the wiring modules.
export class PersistenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
  }
}

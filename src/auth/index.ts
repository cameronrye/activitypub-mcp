/**
 * Authentication module exports.
 *
 * Provides account management and authenticated API client for write operations.
 */

export { type AccountCredentials, type AccountInfo, accountManager } from "./account-manager.js";
export {
  authenticatedClient,
  type CreatePostOptions,
  type PostVisibility,
  type Relationship,
  type Status,
} from "./authenticated-client.js";

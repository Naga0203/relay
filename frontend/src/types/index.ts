export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: User;
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  avatarUrl: string | null;
  members: ConversationMember[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  publicKey: string | null;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string | null;
  messageType: 'TEXT' | 'IMAGE' | 'GIF' | 'FILE' | 'SYSTEM';
  sequenceNumber: number;
  replyToId: string | null;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  deleted: boolean;
  // ARCH FIX (§9): Per-recipient wrapped message keys for group E2EE.
  // Map of userId → base64 wrapped per-message AES key. Null for legacy messages.
  recipientKeys: Record<string, string> | null;
}

export interface MessagePage {
  messages: Message[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface FileUploadResponse {
  fileName: string;
  fileUrl: string;
  contentType: string;
  size: number;
}

export interface SendMessageRequest {
  content?: string;
  messageType?: 'TEXT' | 'IMAGE' | 'GIF' | 'FILE';
  replyToId?: string;
  idempotencyKey?: string;
  // ARCH FIX (§9): Per-recipient wrapped message keys for group E2EE.
  recipientKeys?: Record<string, string>;
}

export interface CreateConversationRequest {
  type: 'DIRECT' | 'GROUP';
  name?: string;
  memberIds: string[];
}

export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
  errors?: Record<string, string>;
}

export interface PublicKeyResponse {
  publicKey: string;
}

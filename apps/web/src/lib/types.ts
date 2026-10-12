export type Role = "OWNER" | "MEMBER";

export interface User {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  role: Role;
}

export interface Channel {
  id: string;
  name: string;
  topic: string | null;
}

export interface Member extends User {
  role: Role;
}

export interface TeamDetail {
  id: string;
  name: string;
  inviteCode: string;
  role: Role;
  channels: Channel[];
  members: Member[];
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: User;
}

export type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

import type { User } from "@/lib/types";

/** Photo GitHub si elle existe, sinon les deux premières lettres du pseudo. */
export function Avatar({ user, size = 32 }: { user: Pick<User, "login" | "avatarUrl">; size?: number }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-md bg-raised"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md bg-raised font-mono text-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {user.login.slice(0, 2).toLowerCase()}
    </span>
  );
}

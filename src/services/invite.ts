/**
 * Build the URL shared by H5 invitations.
 *
 * The uni-app H5 build uses hash routing, so the room code belongs in the
 * hash rather than in the page's existing query string. Clearing both the
 * search and hash also prevents an old room code from being carried into a
 * newly generated invitation.
 */
export function createInviteUrl(baseUrl: string, roomCode: string): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = `/pages/index/index?room=${encodeURIComponent(roomCode)}`;
  return url.toString();
}

export function roomInviteText(roomCode: string): string {
  return `房间号：${roomCode}`;
}

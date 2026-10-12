/** Dernière équipe et dernier canal ouverts, pour rouvrir l'appli au même endroit. */
const TEAM_KEY = "devchat.lastTeam";
const channelKey = (teamId: string) => `devchat.lastChannel.${teamId}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

export const loadLastTeam = () => read(TEAM_KEY);
export const saveLastTeam = (teamId: string) => write(TEAM_KEY, teamId);
export const loadLastChannel = (teamId: string) => read(channelKey(teamId));
export const saveLastChannel = (teamId: string, channelId: string) => write(channelKey(teamId), channelId);

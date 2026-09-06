import { createApiClient } from "@flowforge/api-client";
import { getAuthToken, getServerUrl } from "../utils/storage";

const client = createApiClient(getServerUrl, getAuthToken);

export * from "@flowforge/api-client";

export async function getSettings() { return client.getSettings(); }
export async function updateSettings(payload: Parameters<typeof client.updateSettings>[0]) { return client.updateSettings(payload); }
export async function getGoogleCalendars(accountId: number) { return client.getGoogleCalendars(accountId); }
export async function linkGoogleCalendar(accountId: number, payload: Parameters<typeof client.linkGoogleCalendar>[1]) { return client.linkGoogleCalendar(accountId, payload); }
export async function updateCalendar(id: number, payload: Parameters<typeof client.updateCalendar>[1]) { return client.updateCalendar(id, payload); }
export async function triggerSyncTasks() { return client.triggerSyncTasks(); }
export async function listCalendars() { return client.listCalendars(); }
export async function createCalendar(payload: Parameters<typeof client.createCalendar>[0]) { return client.createCalendar(payload); }
export async function deleteCalendar(id: number) { return client.deleteCalendar(id); }
export async function listSchedulingPresets() { return client.listSchedulingPresets(); }
export async function createSchedulingPreset(payload: Parameters<typeof client.createSchedulingPreset>[0]) { return client.createSchedulingPreset(payload); }
export async function updateSchedulingPreset(id: number, payload: Parameters<typeof client.updateSchedulingPreset>[1]) { return client.updateSchedulingPreset(id, payload); }
export async function deleteSchedulingPreset(id: number) { return client.deleteSchedulingPreset(id); }
export async function listWorkingHours() { return client.listWorkingHours(); }
export async function replaceWorkingHours(payload: Parameters<typeof client.replaceWorkingHours>[0]) { return client.replaceWorkingHours(payload); }
export async function listTaskLists() { return client.listTaskLists(); }
export async function createTaskList(payload: Parameters<typeof client.createTaskList>[0]) { return client.createTaskList(payload); }
export async function updateTaskList(id: number, payload: Parameters<typeof client.updateTaskList>[1]) { return client.updateTaskList(id, payload); }
export async function deleteTaskList(id: number) { return client.deleteTaskList(id); }
export async function listTasks(completed?: boolean, listId?: number) { return client.listTasks(completed, listId); }
export async function createTask(payload: Parameters<typeof client.createTask>[0]) { return client.createTask(payload); }
export async function updateTask(id: number, payload: Parameters<typeof client.updateTask>[1]) { return client.updateTask(id, payload); }
export async function deleteTask(id: number) { return client.deleteTask(id); }
export async function getTask(id: number) { return client.getTask(id); }
export async function getSchedule(date: string, days = 1) { return client.getSchedule(date, days); }
export async function runAutoSchedule(forceRefresh = false) { return client.runAutoSchedule(forceRefresh); }
export async function createEvent(payload: Parameters<typeof client.createEvent>[0]) { return client.createEvent(payload); }
export async function updateEvent(id: number, payload: Parameters<typeof client.updateEvent>[1]) { return client.updateEvent(id, payload); }
export async function deleteEvent(id: number) { return client.deleteEvent(id); }
export async function getAppInfo() { return client.getAppInfo(); }
export async function getGoogleStatus() { return client.getGoogleStatus(); }
export async function getDeadlineAlerts() { return client.getDeadlineAlerts(); }
export async function disconnectGoogleAccount(id: number) { return client.disconnectGoogleAccount(id); }
export async function resetAccount() { return client.resetAccount(); }
export function googleAuthStartUrl(serverUrl: string, accessToken?: string | null) {
  return client.googleAuthStartUrl(serverUrl, accessToken);
}

export async function getAuthStatus() { return client.getAuthStatus(); }
export async function login(payload: { username: string; password: string }) { return client.login(payload); }
export async function bootstrap(payload: { username: string; password: string; email?: string }) {
  return client.bootstrap(payload);
}
export async function me() { return client.me(); }
export async function logout() { return client.logout(); }
export async function changePassword(payload: { current_password: string; new_password: string }) {
  return client.changePassword(payload);
}
export async function listUsers() { return client.listUsers(); }
export async function createUser(payload: Parameters<typeof client.createUser>[0]) { return client.createUser(payload); }
export async function updateUser(id: number, payload: Parameters<typeof client.updateUser>[1]) {
  return client.updateUser(id, payload);
}
export async function deleteUser(id: number) { return client.deleteUser(id); }
export async function resetUserPassword(id: number, password?: string) {
  return client.resetUserPassword(id, password ? { password } : {});
}

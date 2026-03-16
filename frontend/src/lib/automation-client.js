import axios from 'axios';

const baseURL = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/automation`;

function withAuthConfig(userId) {
  return {
    withCredentials: true,
    params: {
      userId,
    },
  };
}

export async function fetchAutomationEvents(userId) {
  const response = await axios.get(`${baseURL}/events`, withAuthConfig(userId));
  return response.data;
}

export async function fetchAutomationEvent(userId, eventId) {
  const response = await axios.get(`${baseURL}/events/${eventId}`, withAuthConfig(userId));
  return response.data;
}

export async function createAutomationEvent(userId, payload) {
  const response = await axios.post(`${baseURL}/events`, { ...payload, userId }, { withCredentials: true });
  return response.data;
}

export async function updateAutomationEvent(userId, eventId, payload) {
  const response = await axios.put(`${baseURL}/events/${eventId}`, { ...payload, userId }, { withCredentials: true });
  return response.data;
}

export async function deleteAutomationEvent(userId, eventId) {
  const response = await axios.delete(`${baseURL}/events/${eventId}`, {
    withCredentials: true,
    params: { userId },
  });
  return response.data;
}

export async function runAutomationEvent(userId, eventId) {
  const response = await axios.post(`${baseURL}/events/${eventId}/run`, { userId }, { withCredentials: true });
  return response.data;
}

export async function fetchEventRuns(userId, eventId, limit = 20) {
  const response = await axios.get(`${baseURL}/events/${eventId}/runs`, {
    withCredentials: true,
    params: { userId, limit },
  });
  return response.data;
}

export async function fetchRunLogs(userId, runId, limit = 200) {
  const response = await axios.get(`${baseURL}/runs/${runId}/logs`, {
    withCredentials: true,
    params: { userId, limit },
  });
  return response.data;
}

export async function fetchEventSheetLogSources(userId, eventId) {
  const response = await axios.get(`${baseURL}/events/${eventId}/sheet-logs`, {
    withCredentials: true,
    params: { userId },
  });
  return response.data;
}

export async function fetchEventSheetLogs(userId, eventId, sourceId, limit = 200) {
  const response = await axios.get(`${baseURL}/events/${eventId}/sheet-logs`, {
    withCredentials: true,
    params: { userId, sourceId, limit },
  });
  return response.data;
}

export async function fetchAccountSheetLogSources(userId) {
  const response = await axios.get(`${baseURL}/sheet-logs`, {
    withCredentials: true,
    params: { userId },
  });
  return response.data;
}

export async function fetchAccountSheetLogs(userId, eventId, sourceId, limit = 200) {
  const response = await axios.get(`${baseURL}/sheet-logs`, {
    withCredentials: true,
    params: { userId, eventId, sourceId, limit },
  });
  return response.data;
}

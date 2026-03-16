'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import Header from '@/components/Header';
import {
  createAutomationEvent,
  deleteAutomationEvent,
  fetchAutomationEvent,
  fetchAutomationEvents,
  fetchEventSheetLogs,
  fetchEventSheetLogSources,
  fetchEventRuns,
  fetchRunLogs,
  runAutomationEvent,
  updateAutomationEvent,
} from '@/lib/automation-client';

const NODE_TYPES = [
  { type: 'timer', label: 'Timer' },
  { type: 'sheet-check', label: 'Sheet Check' },
  { type: 'condition', label: 'Condition' },
  { type: 'send-email', label: 'Send Email' },
  { type: 'log', label: 'Log' },
];

const DEFAULT_NODES = [
  {
    id: 'timer-1',
    type: 'default',
    position: { x: 0, y: 80 },
    data: { label: 'Timer', kind: 'timer' },
  },
  {
    id: 'sheet-1',
    type: 'default',
    position: { x: 280, y: 80 },
    data: { label: 'Sheet Check', kind: 'sheet-check', sourceIds: [] },
  },
  {
    id: 'condition-1',
    type: 'default',
    position: { x: 560, y: 80 },
    data: {
      label: 'Condition',
      kind: 'condition',
      requireEmail: true,
      requireAttachment: false,
      excludePreviouslySent: true,
      nameStartsWith: '',
      groupColumn: 'group',
      allowedGroups: '',
      specialMessageGroups: '',
      specialMessageGroupColumn: 'group',
      specialMessage: '',
    },
  },
  {
    id: 'mail-1',
    type: 'default',
    position: { x: 840, y: 80 },
    data: {
      label: 'Send Email',
      kind: 'send-email',
      subjectTemplate: 'Certificate available for $$$name$$$',
      bodyTemplate: '<p>Hello $$$name$$$, your certificate is available now.</p>',
    },
  },
  {
    id: 'log-1',
    type: 'default',
    position: { x: 1120, y: 80 },
    data: { label: 'Log', kind: 'log' },
  },
];

const DEFAULT_EDGES = [
  { id: 'edge-1', source: 'timer-1', target: 'sheet-1' },
  { id: 'edge-2', source: 'sheet-1', target: 'condition-1' },
  { id: 'edge-3', source: 'condition-1', target: 'mail-1' },
  { id: 'edge-4', source: 'mail-1', target: 'log-1' },
];

function buildDefaultSheetSource() {
  return {
    id: `sheet-source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Primary Sheet',
    sheetLink: '',
    certificateColumn: 'certificate_status',
    certificateAvailableValue: 'available',
    recipientEmailColumn: 'email',
    recipientNameColumn: 'name',
  };
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeNodeForSave(node) {
  return {
    id: node.id,
    type: node.data?.kind || 'log',
    label: node.data?.label || node.data?.kind || 'Node',
    position: node.position,
    data: {
      ...node.data,
    },
  };
}

function normalizeEdgeForSave(edge) {
  return {
    id: edge.id || makeId('edge'),
    source: edge.source,
    target: edge.target,
  };
}

export default function AutomationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user;

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });

  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventName, setEventName] = useState('New Automation Event');
  const [eventDescription, setEventDescription] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [isEnabled, setIsEnabled] = useState(true);
  const [sheetSources, setSheetSources] = useState([buildDefaultSheetSource()]);

  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState('');

  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runLogs, setRunLogs] = useState([]);
  const [sheetLogSources, setSheetLogSources] = useState([]);
  const [selectedSheetLogId, setSelectedSheetLogId] = useState('');
  const [selectedSheetLogs, setSelectedSheetLogs] = useState([]);
  const [sheetLogsLoading, setSheetLogsLoading] = useState(false);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const currentRun = useMemo(() => runs.find((run) => String(run._id) === String(selectedRunId)) || null, [runs, selectedRunId]);
  const shouldPoll = Boolean(currentRun && currentRun.status === 'running' && selectedEventId);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    if (!user) {
      router.push('/login');
      return;
    }

    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user, router]);

  useEffect(() => {
    if (!shouldPoll || !selectedRunId || !user?.id || !selectedEventId) {
      return;
    }

    const timer = setInterval(async () => {
      await refreshRuns(selectedEventId);
      await refreshLogs(selectedRunId);
    }, 4000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPoll, selectedRunId, selectedEventId, user?.id]);

  async function loadEvents() {
    if (!user?.id) {
      return;
    }

    setLoadingEvents(true);
    try {
      const response = await fetchAutomationEvents(user.id);
      const list = response.events || [];
      setEvents(list);
      if (list.length) {
        await openEvent(list[0].id);
      } else {
        resetEditor();
      }
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.response?.data?.message || 'Failed to load events.' });
    } finally {
      setLoadingEvents(false);
    }
  }

  async function openEvent(eventId) {
    if (!user?.id) {
      return;
    }

    setSelectedEventId(eventId);
    setSelectedRunId('');
    setRunLogs([]);

    try {
      const response = await fetchAutomationEvent(user.id, eventId);
      const event = response.event;
      setEventName(event.name || 'Untitled Event');
      setEventDescription(event.description || '');
      setIntervalMinutes(Number(event.intervalMinutes || 60));
      setIsEnabled(Boolean(event.isEnabled));
      setSheetSources(Array.isArray(event.sheetSources) && event.sheetSources.length ? event.sheetSources : [buildDefaultSheetSource()]);

      const mappedNodes = (event.workflow?.nodes || []).map((node) => ({
        id: node.id,
        type: 'default',
        position: node.position || { x: 0, y: 0 },
        data: {
          ...node.data,
          kind: node.type,
          label: node.label || node.type,
        },
      }));
      const mappedEdges = (event.workflow?.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }));

      setNodes(mappedNodes.length ? mappedNodes : DEFAULT_NODES);
      setEdges(mappedEdges.length ? mappedEdges : DEFAULT_EDGES);
      setSelectedNodeId(mappedNodes[0]?.id || '');

      await refreshRuns(eventId);
      await refreshSheetLogSources(eventId);
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.response?.data?.message || 'Failed to open event.' });
    }
  }

  async function refreshSheetLogSources(eventId) {
    if (!user?.id || !eventId) {
      return;
    }

    const response = await fetchEventSheetLogSources(user.id, eventId);
    const sources = response.sources || [];
    setSheetLogSources(sources);

    const preferred = selectedSheetLogId && sources.find((item) => String(item.sourceId) === String(selectedSheetLogId))
      ? String(selectedSheetLogId)
      : sources[0]?.sourceId
        ? String(sources[0].sourceId)
        : '';

    setSelectedSheetLogId(preferred || '');

    if (preferred) {
      await refreshSheetLogs(eventId, preferred);
    } else {
      setSelectedSheetLogs([]);
    }
  }

  async function refreshSheetLogs(eventId, sourceId) {
    if (!user?.id || !eventId || !sourceId) {
      return;
    }

    setSheetLogsLoading(true);
    try {
      const response = await fetchEventSheetLogs(user.id, eventId, sourceId, 200);
      setSelectedSheetLogs(response.logs || []);
    } catch {
      setSelectedSheetLogs([]);
    } finally {
      setSheetLogsLoading(false);
    }
  }

  async function refreshRuns(eventId) {
    if (!user?.id || !eventId) {
      return;
    }

    const response = await fetchEventRuns(user.id, eventId, 20);
    const runItems = response.runs || [];
    setRuns(runItems);

    if (!selectedRunId && runItems.length) {
      setSelectedRunId(String(runItems[0]._id));
      await refreshLogs(String(runItems[0]._id));
    }

    if (selectedRunId) {
      const exists = runItems.find((run) => String(run._id) === String(selectedRunId));
      if (!exists && runItems.length) {
        setSelectedRunId(String(runItems[0]._id));
        await refreshLogs(String(runItems[0]._id));
      }
    }
  }

  async function refreshLogs(runId) {
    if (!user?.id || !runId) {
      return;
    }

    const response = await fetchRunLogs(user.id, runId, 250);
    setRunLogs(response.logs || []);
  }

  function resetEditor() {
    setSelectedEventId('');
    setEventName('New Automation Event');
    setEventDescription('');
    setIntervalMinutes(60);
    setIsEnabled(true);
    setSheetSources([buildDefaultSheetSource()]);
    setNodes(DEFAULT_NODES);
    setEdges(DEFAULT_EDGES);
    setSelectedNodeId('');
    setRuns([]);
    setSelectedRunId('');
    setRunLogs([]);
    setSheetLogSources([]);
    setSelectedSheetLogId('');
    setSelectedSheetLogs([]);
  }

  function addNode(kind) {
    const id = makeId(kind);
    const label = NODE_TYPES.find((item) => item.type === kind)?.label || kind;
    const yOffset = 120 + nodes.length * 40;
    const newNode = {
      id,
      type: 'default',
      position: { x: 150 + nodes.length * 45, y: yOffset },
      data: {
        label,
        kind,
        ...(kind === 'sheet-check' ? { sourceIds: [] } : {}),
        ...(kind === 'condition'
          ? {
              requireEmail: true,
              requireAttachment: false,
              excludePreviouslySent: true,
              nameStartsWith: '',
              groupColumn: 'group',
              allowedGroups: '',
              specialMessageGroups: '',
              specialMessageGroupColumn: 'group',
              specialMessage: '',
            }
          : {}),
        ...(kind === 'send-email'
          ? {
              subjectTemplate: 'Certificate available for $$$name$$$',
              bodyTemplate: '<p>Hello $$$name$$$, your certificate is available now.</p>',
            }
          : {}),
      },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  }

  function updateSelectedNodeData(patch) {
    if (!selectedNodeId) {
      return;
    }

    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== selectedNodeId) {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            ...patch,
          },
        };
      })
    );
  }

  function removeSelectedNode() {
    if (!selectedNodeId) {
      return;
    }
    setNodes((prev) => prev.filter((node) => node.id !== selectedNodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId('');
  }

  function updateSheetSource(index, key, value) {
    setSheetSources((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  }

  function addSheetSource() {
    setSheetSources((prev) => [...prev, buildDefaultSheetSource()]);
  }

  function removeSheetSource(index) {
    setSheetSources((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function saveEvent() {
    if (!user?.id) {
      return;
    }

    if (!eventName.trim()) {
      setStatusMsg({ type: 'error', message: 'Event name is required.' });
      return;
    }

    if (sheetSources.length === 0 || sheetSources.some((item) => !item.sheetLink.trim())) {
      setStatusMsg({ type: 'error', message: 'At least one sheet source with a valid link is required.' });
      return;
    }

    setSaving(true);
    setStatusMsg({ type: '', message: '' });

    const payload = {
      name: eventName.trim(),
      description: eventDescription.trim(),
      isEnabled,
      intervalMinutes: Number(intervalMinutes),
      sheetSources,
      workflow: {
        nodes: nodes.map(normalizeNodeForSave),
        edges: edges.map(normalizeEdgeForSave),
      },
    };

    try {
      if (selectedEventId) {
        const response = await updateAutomationEvent(user.id, selectedEventId, payload);
        setStatusMsg({ type: 'success', message: 'Event updated successfully.' });
        await loadEvents();
        if (response?.event?.id) {
          setSelectedEventId(response.event.id);
        }
      } else {
        const response = await createAutomationEvent(user.id, payload);
        setStatusMsg({ type: 'success', message: 'Event created successfully.' });
        await loadEvents();
        if (response?.event?.id) {
          await openEvent(response.event.id);
        }
      }
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.response?.data?.message || 'Failed to save event.' });
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!selectedEventId || !user?.id) {
      return;
    }

    setRunning(true);
    setStatusMsg({ type: '', message: '' });
    try {
      const response = await runAutomationEvent(user.id, selectedEventId);
      setStatusMsg({ type: 'success', message: response.message || 'Run started.' });
      await refreshRuns(selectedEventId);
      await refreshSheetLogSources(selectedEventId);
      if (response.runId) {
        setSelectedRunId(String(response.runId));
        await refreshLogs(String(response.runId));
      }
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.response?.data?.message || 'Failed to start run.' });
    } finally {
      setRunning(false);
    }
  }

  async function deleteCurrentEvent() {
    if (!selectedEventId || !user?.id) {
      return;
    }

    const confirmed = window.confirm('Delete this event? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      await deleteAutomationEvent(user.id, selectedEventId);
      setStatusMsg({ type: 'success', message: 'Event deleted.' });
      await loadEvents();
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.response?.data?.message || 'Failed to delete event.' });
    }
  }

  if (status === 'loading' || loadingEvents) {
    return (
      <div className="automation-loading">
        <Loader2 className="automation-spin" size={28} />
        <p>Loading automation workspace...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="automation-page">
      <Header />

      <main className="automation-main">
        {statusMsg.message && (
          <div className={`automation-banner ${statusMsg.type === 'success' ? 'ok' : 'error'}`}>
            {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.message}</span>
          </div>
        )}

        <section className="automation-grid">
          <aside className="automation-sidebar">
            <div className="panel-head">
              <h2>Events</h2>
              <button type="button" className="btn ghost" onClick={resetEditor}>
                <Plus size={14} />
                New
              </button>
            </div>
            <div className="event-list">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`event-item ${selectedEventId === String(event.id) ? 'active' : ''}`}
                  onClick={() => openEvent(String(event.id))}
                >
                  <strong>{event.name}</strong>
                  <span>{event.isEnabled ? `Every ${event.intervalMinutes} min` : 'Disabled'}</span>
                </button>
              ))}
              {!events.length && <p className="empty-text">No events yet. Create your first workflow.</p>}
            </div>
          </aside>

          <section className="automation-editor">
            <div className="panel-head">
              <h2>Event Setup</h2>
              <div className="head-actions">
                <button type="button" className="btn" onClick={saveEvent} disabled={saving}>
                  {saving ? <Loader2 className="automation-spin" size={14} /> : <Save size={14} />}
                  {selectedEventId ? 'Save' : 'Create'}
                </button>
                <button type="button" className="btn" onClick={runNow} disabled={!selectedEventId || running}>
                  {running ? <Loader2 className="automation-spin" size={14} /> : <Play size={14} />}
                  Run now
                </button>
                <button type="button" className="btn danger" onClick={deleteCurrentEvent} disabled={!selectedEventId}>
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Event name
                <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Certificate dispatch flow" />
              </label>
              <label>
                Interval (minutes)
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value || 1))}
                />
              </label>
              <label className="full">
                Description
                <textarea value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} rows={2} />
              </label>
              <label className="toggle">
                <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
                Event enabled
              </label>
            </div>

            <div className="sheet-section">
              <div className="sheet-title-row">
                <h3>Sheet Sources</h3>
                <button type="button" className="btn ghost" onClick={addSheetSource}>
                  <Plus size={14} />
                  Add sheet
                </button>
              </div>
              {sheetSources.map((source, index) => (
                <div key={source.id} className="sheet-card">
                  <div className="sheet-row">
                    <input
                      value={source.name}
                      onChange={(e) => updateSheetSource(index, 'name', e.target.value)}
                      placeholder="Sheet name"
                    />
                    <input
                      value={source.sheetLink}
                      onChange={(e) => updateSheetSource(index, 'sheetLink', e.target.value)}
                      placeholder="Google Sheet URL"
                    />
                    <button type="button" className="btn danger" onClick={() => removeSheetSource(index)} disabled={sheetSources.length === 1}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="sheet-row">
                    <input
                      value={source.certificateColumn}
                      onChange={(e) => updateSheetSource(index, 'certificateColumn', e.target.value)}
                      placeholder="certificate column"
                    />
                    <input
                      value={source.certificateAvailableValue}
                      onChange={(e) => updateSheetSource(index, 'certificateAvailableValue', e.target.value)}
                      placeholder="available value"
                    />
                    <input
                      value={source.recipientEmailColumn}
                      onChange={(e) => updateSheetSource(index, 'recipientEmailColumn', e.target.value)}
                      placeholder="email column"
                    />
                    <input
                      value={source.recipientNameColumn}
                      onChange={(e) => updateSheetSource(index, 'recipientNameColumn', e.target.value)}
                      placeholder="name column"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="canvas-wrap">
              <div className="canvas-toolbar">
                {NODE_TYPES.map((nodeType) => (
                  <button key={nodeType.type} type="button" className="btn ghost" onClick={() => addNode(nodeType.type)}>
                    <Plus size={12} />
                    {nodeType.label}
                  </button>
                ))}
                {selectedNode && (
                  <button type="button" className="btn danger" onClick={removeSelectedNode}>
                    <Trash2 size={12} />
                    Remove selected node
                  </button>
                )}
              </div>

              <div className="canvas-frame">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={(params) => setEdges((prev) => addEdge({ ...params, id: makeId('edge') }, prev))}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  fitView
                >
                  <MiniMap />
                  <Controls />
                  <Background />
                </ReactFlow>
              </div>
            </div>

            <div className="node-config">
              <h3>Selected Node</h3>
              {!selectedNode && <p className="empty-text">Select a node to configure it.</p>}
              {selectedNode && (
                <div className="node-fields">
                  <label>
                    Label
                    <input
                      value={selectedNode.data?.label || ''}
                      onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                    />
                  </label>

                  {selectedNode.data?.kind === 'sheet-check' && (
                    <div className="source-picks">
                      <p>Choose sheet sources for this step (leave empty = all sheets)</p>
                      {sheetSources.map((source) => {
                        const checked = (selectedNode.data?.sourceIds || []).includes(source.id);
                        return (
                          <label key={source.id} className="source-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = selectedNode.data?.sourceIds || [];
                                const next = e.target.checked
                                  ? [...current, source.id]
                                  : current.filter((item) => item !== source.id);
                                updateSelectedNodeData({ sourceIds: next });
                              }}
                            />
                            {source.name}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {selectedNode.data?.kind === 'send-email' && (
                    <>
                      <label>
                        Subject template
                        <input
                          value={selectedNode.data?.subjectTemplate || ''}
                          onChange={(e) => updateSelectedNodeData({ subjectTemplate: e.target.value })}
                          placeholder="Certificate available for $$$name$$$"
                        />
                      </label>
                      <label>
                        Body template (HTML)
                        <textarea
                          rows={5}
                          value={selectedNode.data?.bodyTemplate || ''}
                          onChange={(e) => updateSelectedNodeData({ bodyTemplate: e.target.value })}
                        />
                      </label>
                    </>
                  )}

                  {selectedNode.data?.kind === 'condition' && (
                    <>
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={selectedNode.data?.excludePreviouslySent ?? true}
                          onChange={(e) => updateSelectedNodeData({ excludePreviouslySent: e.target.checked })}
                        />
                        Skip emails that were already sent earlier
                      </label>

                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={selectedNode.data?.requireAttachment ?? false}
                          onChange={(e) => updateSelectedNodeData({ requireAttachment: e.target.checked })}
                        />
                        Send only when row has attachment/certificate links
                      </label>

                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={selectedNode.data?.requireEmail ?? true}
                          onChange={(e) => updateSelectedNodeData({ requireEmail: e.target.checked })}
                        />
                        Require valid email before sending
                      </label>

                      <label>
                        Name starts with (optional)
                        <input
                          value={selectedNode.data?.nameStartsWith || ''}
                          onChange={(e) => updateSelectedNodeData({ nameStartsWith: e.target.value })}
                          placeholder="ex: A"
                        />
                      </label>

                      <label>
                        Group column name
                        <input
                          value={selectedNode.data?.groupColumn || 'group'}
                          onChange={(e) => updateSelectedNodeData({ groupColumn: e.target.value })}
                          placeholder="group"
                        />
                      </label>

                      <label>
                        Allowed groups (comma separated)
                        <input
                          value={selectedNode.data?.allowedGroups || ''}
                          onChange={(e) => updateSelectedNodeData({ allowedGroups: e.target.value })}
                          placeholder="vip, premium"
                        />
                      </label>

                      <label>
                        Special message group column
                        <input
                          value={selectedNode.data?.specialMessageGroupColumn || 'group'}
                          onChange={(e) => updateSelectedNodeData({ specialMessageGroupColumn: e.target.value })}
                          placeholder="group"
                        />
                      </label>

                      <label>
                        Special message groups (comma separated)
                        <input
                          value={selectedNode.data?.specialMessageGroups || ''}
                          onChange={(e) => updateSelectedNodeData({ specialMessageGroups: e.target.value })}
                          placeholder="vip, pending-review"
                        />
                      </label>

                      <label>
                        Special message for those groups
                        <textarea
                          rows={3}
                          value={selectedNode.data?.specialMessage || ''}
                          onChange={(e) => updateSelectedNodeData({ specialMessage: e.target.value })}
                          placeholder="This message is added only for selected groups."
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="automation-logs">
            <div className="panel-head">
              <h2>Runs & Logs</h2>
            </div>

            <div className="sheet-log-panel">
              <h3>Sheets</h3>
              <div className="sheet-log-sources">
                {sheetLogSources.map((source) => (
                  <button
                    key={source.sourceId}
                    type="button"
                    className={`sheet-source-item ${String(source.sourceId) === String(selectedSheetLogId) ? 'active' : ''}`}
                    onClick={async () => {
                      setSelectedSheetLogId(String(source.sourceId));
                      await refreshSheetLogs(selectedEventId, String(source.sourceId));
                    }}
                  >
                    <strong>{source.sourceName}</strong>
                    <a href={source.sourceLink} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                      Open sheet
                    </a>
                    <small>sent: {source.totalSent || 0}</small>
                    <small>{source.lastSentAt ? `last: ${new Date(source.lastSentAt).toLocaleString()}` : 'no sends yet'}</small>
                  </button>
                ))}
                {!sheetLogSources.length && <p className="empty-text">No sheet sources found for this event.</p>}
              </div>

              <div className="sheet-log-list">
                {sheetLogsLoading && <p className="empty-text">Loading sheet logs...</p>}
                {!sheetLogsLoading && selectedSheetLogs.map((entry) => (
                  <div key={entry.id} className="sheet-log-item">
                    <div className="sheet-log-head">
                      <strong>{entry.email || 'Unknown email'}</strong>
                      <span>{new Date(entry.sentAt).toLocaleString()}</span>
                    </div>
                    <p>{entry.message}</p>
                    <small>row: {entry.rowNumber || '-'} {entry.messageId ? `| messageId: ${entry.messageId}` : ''}</small>
                  </div>
                ))}
                {!sheetLogsLoading && selectedSheetLogId && !selectedSheetLogs.length && (
                  <p className="empty-text">No sent email logs for this sheet yet.</p>
                )}
              </div>
            </div>

            <div className="run-list">
              {runs.map((run) => (
                <button
                  key={run._id}
                  type="button"
                  className={`run-item ${String(run._id) === String(selectedRunId) ? 'active' : ''}`}
                  onClick={async () => {
                    setSelectedRunId(String(run._id));
                    await refreshLogs(String(run._id));
                  }}
                >
                  <strong>{run.status}</strong>
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                  <small>sent {run.summary?.sent || 0} / failed {run.summary?.failed || 0}</small>
                </button>
              ))}
              {!runs.length && <p className="empty-text">No runs yet.</p>}
            </div>

            <div className="log-list">
              {runLogs.map((log) => (
                <div key={log._id} className={`log-item ${log.level}`}>
                  <div className="log-head">
                    <strong>{log.stepType}</strong>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p>{log.message}</p>
                </div>
              ))}
              {!runLogs.length && <p className="empty-text">Select a run to inspect logs.</p>}
            </div>
          </aside>
        </section>
      </main>

      <style jsx>{`
        .automation-page {
          min-height: 100vh;
          background: #090d16;
          color: #e5e7eb;
        }

        .automation-main {
          max-width: 1680px;
          margin: 0 auto;
          padding: 1rem;
        }

        .automation-grid {
          display: grid;
          grid-template-columns: 260px 1fr 360px;
          gap: 1rem;
          align-items: start;
        }

        .automation-sidebar,
        .automation-editor,
        .automation-logs {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 14px;
          padding: 0.85rem;
        }

        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .panel-head h2 {
          font-size: 0.95rem;
          font-weight: 700;
          margin: 0;
        }

        .event-list,
        .run-list,
        .log-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 70vh;
          overflow: auto;
          padding-right: 0.2rem;
        }

        .event-item,
        .run-item {
          text-align: left;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.55);
          padding: 0.6rem;
          color: #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          cursor: pointer;
        }

        .event-item.active,
        .run-item.active {
          border-color: rgba(34, 197, 94, 0.7);
          background: rgba(34, 197, 94, 0.12);
        }

        .event-item span,
        .run-item span,
        .run-item small {
          color: #cbd5e1;
          font-size: 0.76rem;
        }

        .btn {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 8px;
          background: #152238;
          color: #e2e8f0;
          font-size: 0.78rem;
          padding: 0.35rem 0.6rem;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
        }

        .btn.ghost {
          background: transparent;
        }

        .btn.danger {
          border-color: rgba(239, 68, 68, 0.45);
          color: #fecaca;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .head-actions {
          display: flex;
          gap: 0.4rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 180px;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .form-grid label,
        .node-fields label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.77rem;
          color: #cbd5e1;
        }

        .form-grid label.full {
          grid-column: 1 / -1;
        }

        input,
        textarea {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.7);
          color: #f8fafc;
          font-size: 0.82rem;
          padding: 0.45rem 0.6rem;
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-direction: row;
          align-self: end;
        }

        .toggle input {
          width: auto;
        }

        .sheet-section {
          margin-bottom: 0.75rem;
        }

        .sheet-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .sheet-title-row h3,
        .node-config h3 {
          margin: 0;
          font-size: 0.86rem;
        }

        .sheet-card {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 0.5rem;
          margin-bottom: 0.45rem;
          background: rgba(15, 23, 42, 0.45);
        }

        .sheet-row {
          display: grid;
          grid-template-columns: 170px 1fr auto;
          gap: 0.4rem;
          margin-bottom: 0.35rem;
        }

        .sheet-row:last-child {
          margin-bottom: 0;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .canvas-wrap {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 0.75rem;
        }

        .canvas-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          padding: 0.5rem;
          background: rgba(15, 23, 42, 0.9);
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        }

        .canvas-frame {
          height: 340px;
          background: #020617;
        }

        .node-config {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 0.6rem;
          background: rgba(15, 23, 42, 0.45);
        }

        .node-fields {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .source-picks {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          padding: 0.45rem;
        }

        .source-picks p {
          margin: 0;
          font-size: 0.74rem;
          color: #94a3b8;
        }

        .source-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.78rem;
          color: #e2e8f0;
        }

        .inline-toggle {
          display: flex !important;
          flex-direction: row !important;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
        }

        .inline-toggle input {
          width: auto;
        }

        .source-item input {
          width: auto;
        }

        .sheet-log-panel {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 0.6rem;
          background: rgba(15, 23, 42, 0.45);
          margin-bottom: 0.7rem;
        }

        .sheet-log-panel h3 {
          margin: 0 0 0.45rem;
          font-size: 0.83rem;
        }

        .sheet-log-sources,
        .sheet-log-list {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          max-height: 210px;
          overflow: auto;
        }

        .sheet-source-item {
          text-align: left;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.55);
          color: #e2e8f0;
          padding: 0.45rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          cursor: pointer;
        }

        .sheet-source-item.active {
          border-color: rgba(56, 189, 248, 0.65);
          background: rgba(2, 132, 199, 0.15);
        }

        .sheet-source-item a {
          color: #7dd3fc;
          font-size: 0.72rem;
          text-decoration: underline;
          width: fit-content;
        }

        .sheet-source-item small {
          color: #cbd5e1;
          font-size: 0.72rem;
        }

        .sheet-log-list {
          margin-top: 0.5rem;
          border-top: 1px solid rgba(148, 163, 184, 0.18);
          padding-top: 0.5rem;
        }

        .sheet-log-item {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          padding: 0.45rem;
          background: rgba(15, 23, 42, 0.45);
        }

        .sheet-log-head {
          display: flex;
          justify-content: space-between;
          gap: 0.4rem;
          margin-bottom: 0.2rem;
        }

        .sheet-log-head span {
          color: #cbd5e1;
          font-size: 0.72rem;
        }

        .sheet-log-item p {
          margin: 0 0 0.2rem;
          font-size: 0.75rem;
          color: #e2e8f0;
        }

        .sheet-log-item small {
          color: #cbd5e1;
          font-size: 0.71rem;
        }

        .log-item {
          border-radius: 8px;
          padding: 0.5rem;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.45);
        }

        .log-item.error {
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(127, 29, 29, 0.32);
        }

        .log-head {
          display: flex;
          justify-content: space-between;
          gap: 0.4rem;
          margin-bottom: 0.25rem;
        }

        .log-head span {
          font-size: 0.74rem;
          color: #cbd5e1;
        }

        .log-item p {
          margin: 0;
          font-size: 0.78rem;
          color: #f1f5f9;
        }

        .automation-banner {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 10px;
          padding: 0.55rem 0.7rem;
          margin-bottom: 0.8rem;
          border: 1px solid;
          font-size: 0.82rem;
        }

        .automation-banner.ok {
          border-color: rgba(34, 197, 94, 0.5);
          background: rgba(22, 101, 52, 0.33);
        }

        .automation-banner.error {
          border-color: rgba(239, 68, 68, 0.5);
          background: rgba(127, 29, 29, 0.33);
        }

        .empty-text {
          margin: 0;
          color: #94a3b8;
          font-size: 0.78rem;
        }

        .automation-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 0.5rem;
          background: #020617;
          color: #cbd5e1;
        }

        .automation-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1200px) {
          .automation-grid {
            grid-template-columns: 1fr;
          }

          .event-list,
          .run-list,
          .log-list {
            max-height: 260px;
          }

          .sheet-row,
          .sheet-row:last-child {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

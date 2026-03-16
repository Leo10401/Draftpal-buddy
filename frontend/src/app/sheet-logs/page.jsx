'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ExternalLink, Loader2, MailCheck } from 'lucide-react';

import Header from '@/components/Header';
import {
  fetchAccountSheetLogSources,
  fetchAccountSheetLogs,
} from '@/lib/automation-client';

export default function SheetLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user;

  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selectedSourceKey, setSelectedSourceKey] = useState('');
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedSource = useMemo(
    () => sources.find((item) => `${item.eventId}:${item.sourceId}` === selectedSourceKey) || null,
    [sources, selectedSourceKey]
  );

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (!user?.id) {
      router.push('/login');
      return;
    }

    void loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user?.id, router]);

  async function loadSources() {
    if (!user?.id) {
      return;
    }

    setLoadingSources(true);
    setErrorMessage('');
    try {
      const response = await fetchAccountSheetLogSources(user.id);
      const nextSources = response.sources || [];
      setSources(nextSources);

      const preferredKey = nextSources[0] ? `${nextSources[0].eventId}:${nextSources[0].sourceId}` : '';
      setSelectedSourceKey(preferredKey);

      if (preferredKey) {
        await loadLogs(nextSources[0].eventId, nextSources[0].sourceId);
      } else {
        setLogs([]);
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Failed to load sheet logs.');
      setSources([]);
      setSelectedSourceKey('');
      setLogs([]);
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadLogs(eventId, sourceId) {
    if (!user?.id || !eventId || !sourceId) {
      return;
    }

    setLoadingLogs(true);
    setErrorMessage('');
    try {
      const response = await fetchAccountSheetLogs(user.id, eventId, sourceId, 300);
      setLogs(response.logs || []);
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Failed to load selected sheet logs.');
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  if (status === 'loading' || loadingSources) {
    return (
      <div className="page-loading">
        <Loader2 className="spin" size={28} />
        <p>Loading sheet logs...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="sheet-log-page">
      <Header />

      <main className="sheet-log-main">
        <section className="sheet-log-grid">
          <aside className="source-panel">
            <div className="panel-head">
              <h2>Sheets Used For Sending</h2>
              <button type="button" className="refresh-btn" onClick={loadSources}>
                Refresh
              </button>
            </div>

            {errorMessage && <p className="error-msg">{errorMessage}</p>}

            <div className="source-list">
              {sources.map((source) => {
                const key = `${source.eventId}:${source.sourceId}`;
                const isActive = key === selectedSourceKey;

                return (
                  <button
                    key={key}
                    type="button"
                    className={`source-item ${isActive ? 'active' : ''}`}
                    onClick={async () => {
                      setSelectedSourceKey(key);
                      await loadLogs(source.eventId, source.sourceId);
                    }}
                  >
                    <strong>{source.sourceName || 'Unnamed sheet'}</strong>
                    <span>{source.eventName || 'Unknown event'}</span>
                    <small>Sent: {source.totalSent || 0}</small>
                    <small>{source.lastSentAt ? `Last: ${new Date(source.lastSentAt).toLocaleString()}` : 'No sends yet'}</small>
                  </button>
                );
              })}
              {!sources.length && <p className="empty-text">No sheet logs found for this account yet.</p>}
            </div>
          </aside>

          <section className="logs-panel">
            <div className="panel-head">
              <h2>{selectedSource?.sourceName || 'Sent Email Logs'}</h2>
              {selectedSource?.sourceLink && (
                <a href={selectedSource.sourceLink} target="_blank" rel="noreferrer" className="sheet-link">
                  Open Sheet
                  <ExternalLink size={14} />
                </a>
              )}
            </div>

            {selectedSource && (
              <p className="selected-meta">
                Event: {selectedSource.eventName} | Total sent: {selectedSource.totalSent || 0}
              </p>
            )}

            <div className="logs-list">
              {loadingLogs && (
                <p className="empty-text">
                  <Loader2 className="spin inline" size={14} /> Loading logs...
                </p>
              )}

              {!loadingLogs && logs.map((entry) => (
                <article key={entry.id} className="log-item">
                  <div className="log-head">
                    <div className="log-email">
                      <MailCheck size={15} />
                      <strong>{entry.email || 'Unknown recipient'}</strong>
                    </div>
                    <span>{new Date(entry.sentAt).toLocaleString()}</span>
                  </div>
                  <p>{entry.message}</p>
                  <small>
                    Row: {entry.rowNumber || '-'}
                    {entry.messageId ? ` | Message ID: ${entry.messageId}` : ''}
                  </small>
                </article>
              ))}

              {!loadingLogs && selectedSource && logs.length === 0 && (
                <p className="empty-text">No sent-email logs for this sheet yet.</p>
              )}

              {!selectedSource && <p className="empty-text">Select a sheet source to inspect sent email logs.</p>}
            </div>
          </section>
        </section>
      </main>

      <style jsx>{`
        .sheet-log-page {
          min-height: 100vh;
          background: #090d16;
          color: #e5e7eb;
        }

        .sheet-log-main {
          max-width: 1480px;
          margin: 0 auto;
          padding: 1rem;
        }

        .sheet-log-grid {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 1rem;
        }

        .source-panel,
        .logs-panel {
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 14px;
          padding: 0.9rem;
        }

        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .panel-head h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
        }

        .refresh-btn {
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 8px;
          background: rgba(2, 132, 199, 0.14);
          color: #bae6fd;
          padding: 0.4rem 0.75rem;
          cursor: pointer;
          font-weight: 600;
        }

        .source-list,
        .logs-list {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          max-height: 75vh;
          overflow: auto;
          padding-right: 0.2rem;
        }

        .source-item {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          background: rgba(2, 6, 23, 0.45);
          color: #e5e7eb;
          text-align: left;
          padding: 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          cursor: pointer;
          transition: border-color 0.2s ease, transform 0.2s ease;
        }

        .source-item:hover {
          border-color: rgba(56, 189, 248, 0.45);
          transform: translateY(-1px);
        }

        .source-item.active {
          border-color: rgba(56, 189, 248, 0.65);
          background: rgba(2, 132, 199, 0.22);
        }

        .source-item span {
          color: #93c5fd;
          font-size: 0.82rem;
        }

        .source-item small {
          color: #94a3b8;
          font-size: 0.78rem;
        }

        .selected-meta {
          margin: 0 0 0.75rem;
          color: #93c5fd;
          font-size: 0.85rem;
        }

        .log-item {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          background: rgba(2, 6, 23, 0.5);
          padding: 0.7rem;
        }

        .log-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
          font-size: 0.84rem;
          color: #94a3b8;
          margin-bottom: 0.35rem;
        }

        .log-email {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          color: #e2e8f0;
        }

        .log-item p {
          margin: 0 0 0.3rem;
          color: #e5e7eb;
          font-size: 0.9rem;
        }

        .log-item small {
          color: #94a3b8;
          font-size: 0.78rem;
        }

        .sheet-link {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          color: #7dd3fc;
          text-decoration: none;
          font-size: 0.85rem;
        }

        .sheet-link:hover {
          color: #bae6fd;
        }

        .error-msg {
          margin: 0 0 0.75rem;
          color: #fda4af;
          font-size: 0.85rem;
        }

        .empty-text {
          color: #94a3b8;
          font-size: 0.88rem;
          margin: 0.2rem 0;
        }

        .page-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.7rem;
          background: #090d16;
          color: #dbeafe;
        }

        .spin {
          animation: spin 0.9s linear infinite;
        }

        .inline {
          vertical-align: middle;
          margin-right: 0.3rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1040px) {
          .sheet-log-grid {
            grid-template-columns: 1fr;
          }

          .source-list,
          .logs-list {
            max-height: none;
          }
        }
      `}</style>
    </div>
  );
}

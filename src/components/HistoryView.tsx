import type { GenerationHistoryEntry } from "../types/generation";

type HistoryViewProps = {
  entries: GenerationHistoryEntry[];
  onOpenArchive: (archivePath: string) => void;
  onBack: () => void;
};

const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString();
};

const HistoryView = ({ entries, onOpenArchive, onBack }: HistoryViewProps) => {
  return (
    <main className="container">
      <div className="header">
        <h1>Historique des générations</h1>
        <button onClick={onBack} className="btn btn-secondary">
          Retour à la liste
        </button>
      </div>

      {entries.length === 0 ? (
        <p>Aucune génération n'a encore été effectuée.</p>
      ) : (
        <div className="history-list">
          {entries.map((entry) => (
            <div key={entry.id} className="history-card">
              <div className="history-info">
                <h3>{entry.template_name}</h3>
                <p>{entry.image_count} image(s) générée(s) — {formatDate(entry.created_at)}</p>
                <p className="archive-path">{entry.archive_path}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenArchive(entry.archive_path)}
              >
                Ouvrir le dossier
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};

export default HistoryView;

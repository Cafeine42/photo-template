import type { ChangeEvent } from "react";
import type { PhotoTemplate } from "../types";

interface TemplateGenerationViewProps {
  photoTemplates: PhotoTemplate[];
  selectedTemplate: PhotoTemplate | null;
  onSelectTemplate: (template: PhotoTemplate | null) => void;
  selectedImageFolder: string;
  onSelectFolder: () => void;
  onGenerate: () => void;
  generationProgress: number;
  isGenerating: boolean;
  archivePath: string;
  onDownload: () => void;
  onBack: () => void;
  message: string;
}

const TemplateGenerationView = ({
  photoTemplates,
  selectedTemplate,
  onSelectTemplate,
  selectedImageFolder,
  onSelectFolder,
  onGenerate,
  generationProgress,
  isGenerating,
  archivePath,
  onDownload,
  onBack,
  message,
}: TemplateGenerationViewProps) => {
  const handleTemplateChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const templateId = parseInt(event.target.value, 10);
    if (Number.isNaN(templateId)) {
      onSelectTemplate(null);
      return;
    }

    const template = photoTemplates.find((item) => item.id === templateId) || null;
    onSelectTemplate(template);
  };

  return (
    <main className="container">
      <div className="header">
        <h1>Génération d'images</h1>
        <button onClick={onBack} className="btn btn-secondary">
          Retour à la liste
        </button>
      </div>

      {message && (
        <p className={`message ${message.includes('Erreur') ? 'error' : 'success'}`}>
          {message}
        </p>
      )}

      <div className="generation-form">
        <div className="form-group">
          <label htmlFor="template-select">Sélectionner un template:</label>
          <select
            id="template-select"
            value={selectedTemplate?.id ?? ''}
            onChange={handleTemplateChange}
            disabled={isGenerating}
          >
            <option value="">Choisir un template...</option>
            {photoTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="folder-path">Dossier d'images source:</label>
          <div className="folder-selection">
            <input
              id="folder-path"
              type="text"
              value={selectedImageFolder}
              placeholder="Aucun dossier sélectionné"
              readOnly
              disabled={isGenerating}
            />
            <button
              type="button"
              onClick={onSelectFolder}
              className="btn btn-secondary"
              disabled={isGenerating}
            >
              Parcourir
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button
            onClick={onGenerate}
            disabled={!selectedTemplate || !selectedImageFolder || isGenerating}
            className="btn btn-primary"
          >
            {isGenerating ? "Génération en cours..." : "Lancer la génération"}
          </button>
        </div>

        {isGenerating && (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${generationProgress}%` }}
              ></div>
            </div>
            <p className="progress-text">
              Progression: {Math.round(generationProgress)}%
            </p>
          </div>
        )}

        {archivePath && !isGenerating && (
          <div className="download-section">
            <p className="success-message">✅ Génération terminée avec succès!</p>
            <button onClick={onDownload} className="btn btn-success">
              Télécharger l'archive
            </button>
            <p className="archive-path">Archive créée: {archivePath}</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default TemplateGenerationView;

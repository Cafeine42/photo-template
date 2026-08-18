import type { ChangeEvent } from "react";
import type { PhotoTemplate } from "../types/photoTemplate.ts";
import type { GenerationPreparation } from "../types/generation";

interface TemplateGenerationViewProps {
  photoTemplates: PhotoTemplate[];
  selectedTemplate: PhotoTemplate | null;
  onSelectTemplate: (template: PhotoTemplate | null) => void;
  selectedImageFolder: string;
  onSelectFolder: () => void;
  selectedOutputFolder: string;
  onSelectOutputFolder: () => void;
  preparation: GenerationPreparation | null;
  numberOverrides: Record<string, string>;
  onNumberOverrideChange: (key: string, value: string) => void;
  previewImage: string | null;
  isPreviewLoading: boolean;
  onGeneratePreview: () => void;
  onGenerate: () => void;
  onCancelGeneration: () => void;
  generationProgress: number;
  isGenerating: boolean;
  archivePath: string;
  onDownload: () => void;
  onBack: () => void;
}

const TemplateGenerationView = ({
  photoTemplates,
  selectedTemplate,
  onSelectTemplate,
  selectedImageFolder,
  onSelectFolder,
  selectedOutputFolder,
  onSelectOutputFolder,
  preparation,
  numberOverrides,
  onNumberOverrideChange,
  previewImage,
  isPreviewLoading,
  onGeneratePreview,
  onGenerate,
  onCancelGeneration,
  generationProgress,
  isGenerating,
  archivePath,
  onDownload,
  onBack,
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

        <div className="form-group">
          <label htmlFor="output-folder-path">Dossier de sortie (optionnel):</label>
          <div className="folder-selection">
            <input
              id="output-folder-path"
              type="text"
              value={selectedOutputFolder}
              placeholder="Dossier par défaut de l'application"
              readOnly
              disabled={isGenerating}
            />
            <button
              type="button"
              onClick={onSelectOutputFolder}
              className="btn btn-secondary"
              disabled={isGenerating}
            >
              Parcourir
            </button>
          </div>
        </div>

        {preparation && (
          <div className="form-group">
            {preparation.skipped_subfolder_image_count > 0 && (
              <p className="warning-message">
                ⚠️ {preparation.skipped_subfolder_image_count} image(s) situées dans des
                sous-dossiers ont été ignorées (seul le premier niveau du dossier est traité).
              </p>
            )}

            {preparation.entries.length === 0 ? (
              <p className="empty-coords">Aucune image trouvée dans ce dossier.</p>
            ) : (
              <>
                <label>Numéros détectés (modifiables avant génération):</label>
                <div className="number-review-table">
                  <div className="number-review-row number-review-header">
                    <span>Fichier</span>
                    <span>Numéro</span>
                  </div>
                  {preparation.entries.map((entry) => (
                    <div key={entry.key} className="number-review-row">
                      <span className="number-review-filename">{entry.file_name}</span>
                      <input
                        type="text"
                        value={numberOverrides[entry.key] ?? entry.extracted_number}
                        onChange={(event) => onNumberOverrideChange(entry.key, event.target.value)}
                        disabled={isGenerating}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            onClick={onGeneratePreview}
            disabled={!selectedTemplate || !selectedImageFolder || isGenerating || isPreviewLoading}
            className="btn btn-secondary"
          >
            {isPreviewLoading ? "Génération de l'aperçu..." : "Aperçu avant génération"}
          </button>
        </div>

        {previewImage && (
          <div className="preview-container">
            <p className="crop-panel-title">Aperçu du rendu (première image du dossier)</p>
            <img src={previewImage} alt="Aperçu du rendu" className="preview-image" />
          </div>
        )}

        <div className="form-actions">
          <button
            onClick={onGenerate}
            disabled={!selectedTemplate || !selectedImageFolder || isGenerating}
            className="btn btn-primary"
          >
            {isGenerating ? "Génération en cours..." : "Lancer la génération"}
          </button>
          {isGenerating && (
            <button type="button" onClick={onCancelGeneration} className="btn btn-danger">
              Annuler
            </button>
          )}
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

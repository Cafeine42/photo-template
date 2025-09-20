import { PhotoTemplate } from "../types/photoTemplate";

type TemplateListViewProps = {
  photoTemplates: PhotoTemplate[];
  message: string;
  onCreate: () => void;
  onGenerate: () => void;
  onEdit: (template: PhotoTemplate) => void;
  onDelete: (id: number) => void;
};

const TemplateListView = ({
  photoTemplates,
  message,
  onCreate,
  onGenerate,
  onEdit,
  onDelete,
}: TemplateListViewProps) => {
  return (
    <main className="container">
      <div className="header">
        <h1>Liste des Photo Templates</h1>
        <div className="header-buttons">
          <button onClick={onCreate} className="btn btn-primary">
            Créer un nouveau Photo Template
          </button>
          <button onClick={onGenerate} className="btn btn-success">
            Générer des images
          </button>
        </div>
      </div>

      {message && (
        <p className={`message ${message.includes('Erreur') ? 'error' : 'success'}`}>
          {message}
        </p>
      )}

      <div className="templates-list">
        {photoTemplates.length === 0 ? (
          <p>Aucun Photo Template trouvé. Créez-en un nouveau !</p>
        ) : (
          photoTemplates.map((template) => (
            <div key={template.id} className="template-card">
              <h3>{template.name}</h3>
              <p>
                <strong>Numéro de recadrage:</strong> {template.crop_number}
              </p>
              <p>
                <strong>Image du template:</strong> {template.template_img}
              </p>
              <div className="template-actions">
                <button
                  onClick={() => onEdit(template)}
                  className="btn btn-secondary"
                >
                  Modifier
                </button>
                <button
                  onClick={() => onDelete(template.id)}
                  className="btn btn-danger"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
};

export default TemplateListView;

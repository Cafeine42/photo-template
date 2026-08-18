import { PhotoTemplate } from "../types/photoTemplate";

type TemplateListViewProps = {
  photoTemplates: PhotoTemplate[];
  onCreate: () => void;
  onGenerate: () => void;
  onEdit: (template: PhotoTemplate) => void;
  onDelete: (template: PhotoTemplate) => void;
};

const TemplateListView = ({
  photoTemplates,
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

      <div className="templates-list">
        {photoTemplates.length === 0 ? (
          <p>Aucun Photo Template trouvé. Créez-en un nouveau !</p>
        ) : (
          photoTemplates.map((template) => (
            <div key={template.id} className="template-card">
              <div className="template-thumbnail">
                {template.template_img ? (
                  <img
                    src={`asset://localhost/${template.template_img}`}
                    alt={`Aperçu du template ${template.name}`}
                  />
                ) : (
                  <div className="template-thumbnail-placeholder">Pas d'aperçu</div>
                )}
              </div>
              <h3>{template.name}</h3>
              <div className="template-actions">
                <button
                  onClick={() => onEdit(template)}
                  className="btn btn-secondary"
                >
                  Modifier
                </button>
                <button
                  onClick={() => onDelete(template)}
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

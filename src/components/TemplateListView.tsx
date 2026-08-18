import { useMemo, useState } from "react";
import { PhotoTemplate } from "../types/photoTemplate";

type TemplateListViewProps = {
  photoTemplates: PhotoTemplate[];
  thumbnails: Record<number, string>;
  onCreate: () => void;
  onGenerate: () => void;
  onHistory: () => void;
  onEdit: (template: PhotoTemplate) => void;
  onDuplicate: (template: PhotoTemplate) => void;
  onDelete: (template: PhotoTemplate) => void;
};

type SortOrder = 'name-asc' | 'name-desc' | 'newest' | 'oldest';

const TemplateListView = ({
  photoTemplates,
  thumbnails,
  onCreate,
  onGenerate,
  onHistory,
  onEdit,
  onDuplicate,
  onDelete,
}: TemplateListViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc');
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const categories = useMemo(() => {
    const found = new Set<string>();
    photoTemplates.forEach((template) => {
      if (template.category) found.add(template.category);
    });
    return Array.from(found).sort();
  }, [photoTemplates]);

  const visibleTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = photoTemplates.filter((template) => {
      const matchesQuery = !query || template.name.toLowerCase().includes(query);
      const matchesCategory = !categoryFilter || template.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });

    const sorted = [...filtered];
    switch (sortOrder) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'newest':
        sorted.sort((a, b) => b.id - a.id);
        break;
      case 'oldest':
        sorted.sort((a, b) => a.id - b.id);
        break;
    }
    return sorted;
  }, [photoTemplates, searchQuery, categoryFilter, sortOrder]);

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
          <button onClick={onHistory} className="btn btn-secondary">
            Historique
          </button>
        </div>
      </div>

      {photoTemplates.length > 0 && (
        <div className="list-filters">
          <input
            type="text"
            className="list-search-input"
            placeholder="Rechercher un template par nom..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {categories.length > 0 && (
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          )}
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)}>
            <option value="name-asc">Nom (A→Z)</option>
            <option value="name-desc">Nom (Z→A)</option>
            <option value="newest">Plus récents</option>
            <option value="oldest">Plus anciens</option>
          </select>
        </div>
      )}

      <div className="templates-list">
        {photoTemplates.length === 0 ? (
          <p>Aucun Photo Template trouvé. Créez-en un nouveau !</p>
        ) : visibleTemplates.length === 0 ? (
          <p>Aucun template ne correspond à cette recherche.</p>
        ) : (
          visibleTemplates.map((template) => (
            <div key={template.id} className="template-card">
              <div className="template-thumbnail">
                {thumbnails[template.id] ? (
                  <img
                    src={thumbnails[template.id]}
                    alt={`Aperçu du template ${template.name}`}
                  />
                ) : (
                  <div className="template-thumbnail-placeholder">
                    {template.template_img ? "Chargement..." : "Pas d'aperçu"}
                  </div>
                )}
              </div>
              <h3>{template.name}</h3>
              {template.category && <span className="template-category-badge">{template.category}</span>}
              <div className="template-actions">
                <button
                  onClick={() => onEdit(template)}
                  className="btn btn-secondary"
                >
                  Modifier
                </button>
                <button
                  onClick={() => onDuplicate(template)}
                  className="btn btn-secondary"
                >
                  Dupliquer
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

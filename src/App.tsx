import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import TemplateGenerationView from "./components/TemplateGenerationView";
import type { PhotoTemplate } from "./types";
import "./App.css";

type ViewMode = 'list' | 'create' | 'edit' | 'generate';

function App() {
  const [photoTemplates, setPhotoTemplates] = useState<PhotoTemplate[]>([]);
  const [currentMode, setCurrentMode] = useState<ViewMode>('list');
  const [editingTemplate, setEditingTemplate] = useState<PhotoTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    crop_photo: "",
    crop_number: "",
    template_img: ""
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // New state for image upload and cropping
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [cropNumberRect, setCropNumberRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [currentCropMode, setCurrentCropMode] = useState<'photo' | 'number'>('photo');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // New state for generation process
  const [selectedTemplate, setSelectedTemplate] = useState<PhotoTemplate | null>(null);
  const [selectedImageFolder, setSelectedImageFolder] = useState<string>("");
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [archivePath, setArchivePath] = useState<string>("");

  // Tauri invocation functions
  const selectImageFolder = async () => {
    try {
      const folderPath = await invoke<string>("select_image_folder");
      setSelectedImageFolder(folderPath);
    } catch (error) {
      setMessage(`Erreur lors de la sélection du dossier: ${error}`);
    }
  };

  const generateImages = async () => {
    if (!selectedTemplate) {
      setMessage("Veuillez sélectionner un template");
      return;
    }
    if (!selectedImageFolder) {
      setMessage("Veuillez sélectionner un dossier d'images");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setMessage("");
    
    try {
      const archivePath = await invoke<string>("generate_images_with_template", {
        templateId: selectedTemplate.id,
        imageFolderPath: selectedImageFolder,
      });
      
      setArchivePath(archivePath);
      setMessage("Génération terminée avec succès!");
    } catch (error) {
      setMessage(`Erreur lors de la génération: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadArchive = async () => {
    if (!archivePath) {
      setMessage("Aucune archive à télécharger");
      return;
    }

    try {
      await invoke("download_archive", { archivePath });
      setMessage("Archive ouverte avec succès!");
    } catch (error) {
      setMessage(`Erreur lors de l'ouverture de l'archive: ${error}`);
    }
  };

  useEffect(() => {
    if (currentMode === 'list') {
      loadPhotoTemplates();
    }
  }, [currentMode]);

  // Set up event listeners for progress updates
  useEffect(() => {
    const setupProgressListener = async () => {
      const unlisten = await listen<number>('generation-progress', (event) => {
        setGenerationProgress(event.payload);
      });
      
      return unlisten;
    };

    let unlisten: (() => void) | undefined;
    
    if (currentMode === 'generate') {
      setupProgressListener().then(unlistenFn => {
        unlisten = unlistenFn;
      });
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [currentMode]);

  const loadPhotoTemplates = async () => {
    try {
      const templates: PhotoTemplate[] = await invoke("get_photo_templates");
      setPhotoTemplates(templates);
    } catch (error) {
      setMessage(`Erreur lors du chargement: ${error}`);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      crop_photo: "",
      crop_number: "",
      template_img: ""
    });
    setEditingTemplate(null);
    setMessage("");
    setUploadedImage(null);
    setCropRect({ x: 0, y: 0, width: 0, height: 0 });
    setCropNumberRect({ x: 0, y: 0, width: 0, height: 0 });
    setCurrentCropMode('photo');
  };

  const switchToCreateMode = () => {
    resetForm();
    setCurrentMode('create');
  };

  const switchToEditMode = (template: PhotoTemplate) => {
    setFormData({
      name: template.name,
      crop_photo: template.crop_photo,
      crop_number: template.crop_number,
      template_img: template.template_img
    });
    setEditingTemplate(template);
    setCurrentMode('edit');
    setMessage("");
    
    // Load existing image if template_img exists and is a file path
    if (template.template_img) {
      setUploadedImage(`asset://localhost/${template.template_img}`);
      
      // Parse existing crop coordinates for photo
      try {
        if (template.crop_photo) {
          const coords = JSON.parse(template.crop_photo);
          setCropRect(coords);
        }
      } catch (e) {
        // If parsing fails, reset crop rect
        setCropRect({ x: 0, y: 0, width: 0, height: 0 });
      }
      
      // Parse existing crop coordinates for number
      try {
        if (template.crop_number) {
          const coords = JSON.parse(template.crop_number);
          setCropNumberRect(coords);
        }
      } catch (e) {
        // If parsing fails, reset crop number rect
        setCropNumberRect({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
  };

  const switchToListMode = () => {
    resetForm();
    setCurrentMode('list');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure both crop areas are defined
    if (!formData.name || !formData.template_img) {
      setMessage("Le nom et l'image du template sont requis");
      return;
    }
    
    if (cropRect.width === 0 || cropRect.height === 0) {
      setMessage("Vous devez définir la zone de recadrage photo (rouge)");
      return;
    }
    
    if (cropNumberRect.width === 0 || cropNumberRect.height === 0) {
      setMessage("Vous devez définir la zone de recadrage numéro (bleu)");
      return;
    }

    // Update form data with current crop coordinates
    const finalFormData = {
      ...formData,
      crop_photo: JSON.stringify(cropRect),
      crop_number: JSON.stringify(cropNumberRect)
    };

    setIsLoading(true);
    setMessage("");

    try {
      if (currentMode === 'create') {
        await invoke("add_photo_template", {
          name: finalFormData.name,
          cropPhoto: finalFormData.crop_photo,
          cropNumber: finalFormData.crop_number,
          templateImg: finalFormData.template_img
        });
        setMessage("Photo Template ajouté avec succès!");
      } else if (currentMode === 'edit' && editingTemplate) {
        await invoke("update_photo_template", {
          id: editingTemplate.id,
          name: finalFormData.name,
          cropPhoto: finalFormData.crop_photo,
          cropNumber: finalFormData.crop_number,
          templateImg: finalFormData.template_img
        });
        setMessage("Photo Template modifié avec succès!");
      }
      
      // Reset form and return to list
      setTimeout(() => {
        switchToListMode();
      }, 1500);
    } catch (error) {
      setMessage(`Erreur: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce Photo Template ?")) {
      return;
    }

    try {
      await invoke("delete_photo_template", { id });
      setMessage("Photo Template supprimé avec succès!");
      loadPhotoTemplates();
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(`Erreur lors de la suppression: ${error}`);
    }
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const filePath = await invoke<string>("save_template_image", {
        fileData: Array.from(uint8Array),
        filename: file.name
      });
      
      setFormData(prev => ({ ...prev, template_img: filePath }));
      
      // Create URL for display
      const imageUrl = URL.createObjectURL(file);
      setUploadedImage(imageUrl);
      setCropRect({ x: 0, y: 0, width: 0, height: 0 });
    } catch (error) {
      setMessage(`Erreur lors de l'upload: ${error}`);
    }
  };

  // Canvas drawing handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    
    if (currentCropMode === 'photo') {
      setCropRect({ x, y, width: 0, height: 0 });
    } else {
      setCropNumberRect({ x, y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newRect = {
      x: Math.min(startPos.x, x),
      y: Math.min(startPos.y, y),
      width: Math.abs(x - startPos.x),
      height: Math.abs(y - startPos.y)
    };
    
    if (currentCropMode === 'photo') {
      setCropRect(newRect);
    } else {
      setCropNumberRect(newRect);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    // Update the appropriate crop field with coordinates
    if (currentCropMode === 'photo') {
      setFormData(prev => ({
        ...prev,
        crop_photo: JSON.stringify(cropRect)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        crop_number: JSON.stringify(cropNumberRect)
      }));
    }
  };

  // Draw crop rectangles on canvas
  const drawCropRect = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw crop_photo rectangle (red)
    if (cropRect.width > 0 && cropRect.height > 0) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      
      // Add label for photo crop
      ctx.fillStyle = '#ff0000';
      ctx.font = '12px Arial';
      ctx.fillText('Photo', cropRect.x, cropRect.y - 5);
    }
    
    // Draw crop_number rectangle (blue)
    if (cropNumberRect.width > 0 && cropNumberRect.height > 0) {
      ctx.strokeStyle = '#0000ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropNumberRect.x, cropNumberRect.y, cropNumberRect.width, cropNumberRect.height);
      
      // Add label for number crop
      ctx.fillStyle = '#0000ff';
      ctx.font = '12px Arial';
      ctx.fillText('Number', cropNumberRect.x, cropNumberRect.y - 5);
    }
  };

  // Effect to redraw crop rectangles
  useEffect(() => {
    drawCropRect();
  }, [cropRect, cropNumberRect]);

  // List View
  if (currentMode === 'list') {
    return (
      <main className="container">
        <div className="header">
          <h1>Liste des Photo Templates</h1>
          <div className="header-buttons">
            <button onClick={switchToCreateMode} className="btn btn-primary">
              Créer un nouveau Photo Template
            </button>
            <button onClick={() => setCurrentMode('generate')} className="btn btn-success">
              Générer des images
            </button>
          </div>
        </div>

        {message && <p className={`message ${message.includes('Erreur') ? 'error' : 'success'}`}>{message}</p>}

        <div className="templates-list">
          {photoTemplates.length === 0 ? (
            <p>Aucun Photo Template trouvé. Créez-en un nouveau !</p>
          ) : (
            photoTemplates.map((template) => (
              <div key={template.id} className="template-card">
                <h3>{template.name}</h3>
                <p><strong>Numéro de recadrage:</strong> {template.crop_number}</p>
                <p><strong>Image du template:</strong> {template.template_img}</p>
                <div className="template-actions">
                  <button 
                    onClick={() => switchToEditMode(template)}
                    className="btn btn-secondary"
                  >
                    Modifier
                  </button>
                  <button 
                    onClick={() => handleDelete(template.id)}
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
  }

  // Generation View
  if (currentMode === 'generate') {
    return (
      <TemplateGenerationView
        photoTemplates={photoTemplates}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={(template) => setSelectedTemplate(template)}
        selectedImageFolder={selectedImageFolder}
        onSelectFolder={selectImageFolder}
        onGenerate={generateImages}
        generationProgress={generationProgress}
        isGenerating={isGenerating}
        archivePath={archivePath}
        onDownload={downloadArchive}
        onBack={switchToListMode}
        message={message}
      />
    );
  }

  // Create/Edit Form View
  return (
    <main className="container">
      <div className="header">
        <h1>{currentMode === 'create' ? 'Créer' : 'Modifier'} un Photo Template</h1>
        <button onClick={switchToListMode} className="btn btn-secondary">
          Retour à la liste
        </button>
      </div>

      <form className="photo-template-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Nom:</label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Nom du template..."
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label>Sélection des zones de recadrage:</label>
          <div className="crop-mode-buttons" style={{ marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => setCurrentCropMode('photo')}
              className={`btn ${currentCropMode === 'photo' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ marginRight: '10px' }}
            >
              Zone Photo (Rouge)
            </button>
            <button
              type="button"
              onClick={() => setCurrentCropMode('number')}
              className={`btn ${currentCropMode === 'number' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Zone Numéro (Bleu)
            </button>
          </div>
          <p style={{ fontSize: '0.9em', color: '#666', margin: '5px 0' }}>
            Mode actuel: {currentCropMode === 'photo' ? 'Sélection zone photo' : 'Sélection zone numéro'}
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="template_img">Image du template:</label>
          <input
            id="template_img_upload"
            name="template_img_upload"
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isLoading}
          />
          {uploadedImage && (
            <div className="image-crop-container" style={{ position: 'relative', marginTop: '10px' }}>
              <img 
                src={uploadedImage} 
                alt="Template" 
                style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  const canvas = canvasRef.current;
                  if (canvas) {
                    canvas.width = img.clientWidth;
                    canvas.height = img.clientHeight;
                  }
                }}
              />
              <canvas
                ref={canvasRef}
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  cursor: 'crosshair',
                  pointerEvents: 'auto'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              />
              <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
                {cropRect.width > 0 && cropRect.height > 0 && (
                  <p style={{ color: '#ff0000', margin: '5px 0' }}>
                    Zone Photo (Rouge): {Math.round(cropRect.x)}, {Math.round(cropRect.y)}, {Math.round(cropRect.width)}×{Math.round(cropRect.height)}
                  </p>
                )}
                {cropNumberRect.width > 0 && cropNumberRect.height > 0 && (
                  <p style={{ color: '#0000ff', margin: '5px 0' }}>
                    Zone Numéro (Bleu): {Math.round(cropNumberRect.x)}, {Math.round(cropNumberRect.y)}, {Math.round(cropNumberRect.width)}×{Math.round(cropNumberRect.height)}
                  </p>
                )}
                {cropRect.width === 0 && cropRect.height === 0 && cropNumberRect.width === 0 && cropNumberRect.height === 0 && (
                  <p style={{ fontStyle: 'italic', margin: '5px 0' }}>
                    Aucune zone de recadrage définie. Utilisez les boutons ci-dessus pour choisir le mode, puis dessinez sur l'image.
                  </p>
                )}
              </div>
            </div>
          )}
          <input
            type="hidden"
            name="template_img"
            value={formData.template_img}
          />
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isLoading} className="btn btn-primary">
            {isLoading 
              ? (currentMode === 'create' ? "Création en cours..." : "Modification en cours...")
              : (currentMode === 'create' ? "Créer Photo Template" : "Sauvegarder les modifications")
            }
          </button>
          <button type="button" onClick={switchToListMode} className="btn btn-secondary">
            Annuler
          </button>
        </div>
      </form>
      
      {message && <p className={`message ${message.includes('Erreur') ? 'error' : 'success'}`}>{message}</p>}
    </main>
  );
}

export default App;

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import TemplateListView from "./components/TemplateListView";
import { PhotoTemplate } from "./types/photoTemplate";
import TemplateGenerationView from "./components/TemplateGenerationView";
import HistoryView from "./components/HistoryView";
import Toast from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";
import { GenerationHistoryEntry, GenerationPreparation } from "./types/generation";
import "./App.css";

type ViewMode = 'list' | 'create' | 'edit' | 'generate' | 'history';

const LAST_IMAGE_FOLDER_KEY = "photo-template:lastImageFolder";
const LAST_OUTPUT_FOLDER_KEY = "photo-template:lastOutputFolder";
const ONBOARDING_DISMISSED_KEY = "photo-template:onboardingDismissed";

// --- Crop zone geometry (resize/move handles, zoom-aware coordinates) ---

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type RectShape = { x: number; y: number; width: number; height: number };
type DragKind = { type: 'new' } | { type: 'move' } | { type: 'resize'; handle: Handle };

const DEFAULT_RECT: RectShape = { x: 0, y: 0, width: 0, height: 0 };
const DEFAULT_NUMBER_RECT = { ...DEFAULT_RECT, color: '#000000', fontScale: 1 };

const HANDLE_HIT_RADIUS = 8;
const HANDLE_DRAW_SIZE = 6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const CURSOR_BY_HANDLE: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
};

const handlePositions = (rect: RectShape): Record<Handle, { x: number; y: number }> => ({
  nw: { x: rect.x, y: rect.y },
  n: { x: rect.x + rect.width / 2, y: rect.y },
  ne: { x: rect.x + rect.width, y: rect.y },
  e: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
  se: { x: rect.x + rect.width, y: rect.y + rect.height },
  s: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
  sw: { x: rect.x, y: rect.y + rect.height },
  w: { x: rect.x, y: rect.y + rect.height / 2 },
});

const getHandleAt = (point: { x: number; y: number }, rect: RectShape): Handle | null => {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const handles = handlePositions(rect);
  for (const key of Object.keys(handles) as Handle[]) {
    const h = handles[key];
    if (Math.abs(point.x - h.x) <= HANDLE_HIT_RADIUS && Math.abs(point.y - h.y) <= HANDLE_HIT_RADIUS) {
      return key;
    }
  }
  return null;
};

const isInsideRect = (point: { x: number; y: number }, rect: RectShape): boolean =>
  rect.width > 0 && rect.height > 0 &&
  point.x >= rect.x && point.x <= rect.x + rect.width &&
  point.y >= rect.y && point.y <= rect.y + rect.height;

const resizeRect = (rect: RectShape, handle: Handle, dx: number, dy: number): RectShape => {
  let { x, y, width, height } = rect;

  if (handle.includes('w')) { x = rect.x + dx; width = rect.width - dx; }
  if (handle.includes('e')) { width = rect.width + dx; }
  if (handle.includes('n')) { y = rect.y + dy; height = rect.height - dy; }
  if (handle.includes('s')) { height = rect.height + dy; }

  if (width < 0) { x += width; width = Math.abs(width); }
  if (height < 0) { y += height; height = Math.abs(height); }

  return { x, y, width, height };
};

function App() {
  const [photoTemplates, setPhotoTemplates] = useState<PhotoTemplate[]>([]);
  const [currentMode, setCurrentMode] = useState<ViewMode>('list');
  const [editingTemplate, setEditingTemplate] = useState<PhotoTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    crop_photo: "",
    crop_number: "",
    template_img: "",
    category: ""
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // New state for image upload and cropping
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cropRect, setCropRect] = useState<RectShape>(DEFAULT_RECT);
  const [cropNumberRect, setCropNumberRect] = useState(DEFAULT_NUMBER_RECT);
  const [currentCropMode, setCurrentCropMode] = useState<'photo' | 'number'>('photo');
  const [zoomLevel, setZoomLevel] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<{ kind: DragKind; startPoint: { x: number; y: number }; startRect: RectShape } | null>(null);

  // New state for generation process
  const [selectedTemplate, setSelectedTemplate] = useState<PhotoTemplate | null>(null);
  const [selectedImageFolder, setSelectedImageFolder] = useState<string>(
    () => localStorage.getItem(LAST_IMAGE_FOLDER_KEY) || ""
  );
  const [selectedOutputFolder, setSelectedOutputFolder] = useState<string>(
    () => localStorage.getItem(LAST_OUTPUT_FOLDER_KEY) || ""
  );
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [archivePath, setArchivePath] = useState<string>("");

  // Aperçu et vérification des numéros avant génération
  const [preparation, setPreparation] = useState<GenerationPreparation | null>(null);
  const [numberOverrides, setNumberOverrides] = useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  // Format et qualité des images de sortie
  const [outputFormat, setOutputFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [jpegQuality, setJpegQuality] = useState<number>(90);

  // Historique des générations
  const [historyEntries, setHistoryEntries] = useState<GenerationHistoryEntry[]>([]);

  // Confirmation de suppression
  const [pendingDelete, setPendingDelete] = useState<PhotoTemplate | null>(null);

  // Aide contextuelle affichée jusqu'à ce que l'utilisateur la ferme
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== 'true'
  );

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    setShowOnboarding(false);
  };

  // Tauri invocation functions
  const selectImageFolder = async () => {
    try {
      const folderPath = await invoke<string>("select_image_folder");
      setSelectedImageFolder(folderPath);
      localStorage.setItem(LAST_IMAGE_FOLDER_KEY, folderPath);
    } catch (error) {
      setMessage(`Erreur lors de la sélection du dossier: ${error}`);
    }
  };

  const selectOutputFolder = async () => {
    try {
      const folderPath = await invoke<string>("select_output_folder");
      setSelectedOutputFolder(folderPath);
      localStorage.setItem(LAST_OUTPUT_FOLDER_KEY, folderPath);
    } catch (error) {
      setMessage(`Erreur lors de la sélection du dossier de sortie: ${error}`);
    }
  };

  const updateNumberOverride = (key: string, value: string) => {
    setNumberOverrides(prev => ({ ...prev, [key]: value }));
  };

  const generatePreview = async () => {
    if (!selectedTemplate || !selectedImageFolder) return;

    setIsPreviewLoading(true);
    try {
      const dataUrl = await invoke<string>("preview_generation_image", {
        templateId: selectedTemplate.id,
        imageFolderPath: selectedImageFolder,
        numberOverrides,
      });
      setPreviewImage(dataUrl);
    } catch (error) {
      setMessage(`Erreur lors de la génération de l'aperçu: ${error}`);
    } finally {
      setIsPreviewLoading(false);
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
        outputFolderPath: selectedOutputFolder || null,
        numberOverrides,
        outputFormat,
        jpegQuality,
      });

      setArchivePath(archivePath);
      setMessage("Génération terminée avec succès!");
    } catch (error) {
      setMessage(`Erreur lors de la génération: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const cancelGeneration = async () => {
    try {
      await invoke("cancel_generation");
    } catch (error) {
      setMessage(`Erreur lors de l'annulation: ${error}`);
    }
  };

  const loadGenerationHistory = async () => {
    try {
      const entries = await invoke<GenerationHistoryEntry[]>("get_generation_history");
      setHistoryEntries(entries);
    } catch (error) {
      setMessage(`Erreur lors du chargement de l'historique: ${error}`);
    }
  };

  const openArchiveFolder = async (archivePathToOpen: string) => {
    try {
      await invoke("download_archive", { archivePath: archivePathToOpen });
    } catch (error) {
      setMessage(`Erreur lors de l'ouverture de l'archive: ${error}`);
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

  useEffect(() => {
    if (currentMode === 'history') {
      loadGenerationHistory();
    }
  }, [currentMode]);

  // Analyse le dossier source (fichiers trouvés + numéros détectés) dès qu'il change,
  // pour permettre une vérification/correction avant de lancer la génération.
  useEffect(() => {
    if (currentMode !== 'generate' || !selectedImageFolder) {
      setPreparation(null);
      return;
    }

    let cancelled = false;
    setNumberOverrides({});
    setPreviewImage(null);

    invoke<GenerationPreparation>("prepare_generation", { imageFolderPath: selectedImageFolder })
      .then((result) => {
        if (!cancelled) setPreparation(result);
      })
      .catch((error) => {
        if (!cancelled) setMessage(`Erreur lors de l'analyse du dossier: ${error}`);
      });

    return () => {
      cancelled = true;
    };
  }, [currentMode, selectedImageFolder]);

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
      template_img: "",
      category: ""
    });
    setEditingTemplate(null);
    setMessage("");
    setUploadedImage(null);
    setCropRect(DEFAULT_RECT);
    setCropNumberRect(DEFAULT_NUMBER_RECT);
    setCurrentCropMode('photo');
    setZoomLevel(1);
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
      template_img: template.template_img,
      category: template.category || ""
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
        setCropRect(DEFAULT_RECT);
      }

      // Parse existing crop coordinates for number. Older templates may not have
      // the color/fontScale fields yet, so default them in.
      try {
        if (template.crop_number) {
          const coords = JSON.parse(template.crop_number);
          setCropNumberRect({ ...DEFAULT_NUMBER_RECT, ...coords });
        }
      } catch (e) {
        // If parsing fails, reset crop number rect
        setCropNumberRect(DEFAULT_NUMBER_RECT);
      }
    }
  };

  const duplicateTemplate = (template: PhotoTemplate) => {
    setFormData({
      name: `${template.name} (copie)`,
      crop_photo: template.crop_photo,
      crop_number: template.crop_number,
      template_img: template.template_img,
      category: template.category || ""
    });
    setEditingTemplate(null);
    setCurrentMode('create');
    setMessage("");
    setZoomLevel(1);

    if (template.template_img) {
      setUploadedImage(`asset://localhost/${template.template_img}`);

      try {
        setCropRect(template.crop_photo ? JSON.parse(template.crop_photo) : DEFAULT_RECT);
      } catch (e) {
        setCropRect(DEFAULT_RECT);
      }

      try {
        const coords = template.crop_number ? JSON.parse(template.crop_number) : {};
        setCropNumberRect({ ...DEFAULT_NUMBER_RECT, ...coords });
      } catch (e) {
        setCropNumberRect(DEFAULT_NUMBER_RECT);
      }
    }
  };

  const switchToListMode = () => {
    resetForm();
    setCurrentMode('list');
  };

  const switchToGenerateMode = () => {
    setArchivePath("");
    setGenerationProgress(0);
    setPreviewImage(null);
    setNumberOverrides({});
    setCurrentMode('generate');
  };

  const switchToHistoryMode = () => {
    setCurrentMode('history');
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
          templateImg: finalFormData.template_img,
          category: finalFormData.category
        });
        setMessage("Photo Template ajouté avec succès!");
      } else if (currentMode === 'edit' && editingTemplate) {
        await invoke("update_photo_template", {
          id: editingTemplate.id,
          name: finalFormData.name,
          cropPhoto: finalFormData.crop_photo,
          cropNumber: finalFormData.crop_number,
          templateImg: finalFormData.template_img,
          category: finalFormData.category
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

  const requestDelete = (template: PhotoTemplate) => {
    setPendingDelete(template);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const template = pendingDelete;
    setPendingDelete(null);

    try {
      await invoke("delete_photo_template", { id: template.id });
      setMessage(`Photo Template "${template.name}" supprimé avec succès!`);
      loadPhotoTemplates();
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

      // Create URL for display. The previous crop zones are kept on purpose: when
      // replacing an image with a similar layout, the user can just nudge the
      // existing zones (via drag handles) instead of redrawing from scratch.
      const imageUrl = URL.createObjectURL(file);
      setUploadedImage(imageUrl);
    } catch (error) {
      setMessage(`Erreur lors de l'upload: ${error}`);
    }
  };

  const activeRect = currentCropMode === 'photo' ? cropRect : cropNumberRect;

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const setActiveRect = (next: RectShape) => {
    if (currentCropMode === 'photo') {
      setCropRect(next);
    } else {
      setCropNumberRect(prev => ({ ...prev, ...next }));
    }
  };

  const updateActiveRectField = (field: keyof RectShape, value: number) => {
    if (Number.isNaN(value)) return;
    setActiveRect({ ...activeRect, [field]: value });
  };

  const updateNumberColor = (color: string) => {
    setCropNumberRect(prev => ({ ...prev, color }));
  };

  const updateNumberFontScale = (fontScale: number) => {
    if (Number.isNaN(fontScale)) return;
    setCropNumberRect(prev => ({ ...prev, fontScale }));
  };

  // Canvas drawing handlers: a mousedown either starts a brand new rectangle
  // (click outside the current one), moves it (click inside), or resizes it
  // (click on one of its 8 handles).
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    const handle = getHandleAt(point, activeRect);

    let kind: DragKind;
    if (handle) {
      kind = { type: 'resize', handle };
    } else if (isInsideRect(point, activeRect)) {
      kind = { type: 'move' };
    } else {
      kind = { type: 'new' };
      setActiveRect({ x: point.x, y: point.y, width: 0, height: 0 });
    }

    dragStateRef.current = { kind, startPoint: point, startRect: activeRect };
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const point = getCanvasPoint(e);

    if (!isDrawing || !dragStateRef.current) {
      // Not dragging: just give the user a hint of what a click would do.
      if (canvas) {
        const handle = getHandleAt(point, activeRect);
        if (handle) {
          canvas.style.cursor = CURSOR_BY_HANDLE[handle];
        } else if (isInsideRect(point, activeRect)) {
          canvas.style.cursor = 'move';
        } else {
          canvas.style.cursor = 'crosshair';
        }
      }
      return;
    }

    const { kind, startPoint, startRect } = dragStateRef.current;
    let nextRect: RectShape;

    if (kind.type === 'new') {
      nextRect = {
        x: Math.min(startPoint.x, point.x),
        y: Math.min(startPoint.y, point.y),
        width: Math.abs(point.x - startPoint.x),
        height: Math.abs(point.y - startPoint.y),
      };
    } else if (kind.type === 'move') {
      nextRect = {
        ...startRect,
        x: startRect.x + (point.x - startPoint.x),
        y: startRect.y + (point.y - startPoint.y),
      };
    } else {
      nextRect = resizeRect(startRect, kind.handle, point.x - startPoint.x, point.y - startPoint.y);
    }

    setActiveRect(nextRect);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    dragStateRef.current = null;
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

  // Draw crop rectangles (and, for the active one, its resize handles) on canvas
  const drawCropRect = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawHandles = (rect: RectShape, color: string) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      ctx.fillStyle = color;
      Object.values(handlePositions(rect)).forEach(({ x, y }) => {
        ctx.fillRect(x - HANDLE_DRAW_SIZE / 2, y - HANDLE_DRAW_SIZE / 2, HANDLE_DRAW_SIZE, HANDLE_DRAW_SIZE);
      });
    };

    // Draw crop_photo rectangle (red)
    if (cropRect.width > 0 && cropRect.height > 0) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

      ctx.fillStyle = '#ff0000';
      ctx.font = '12px Arial';
      ctx.fillText('Photo', cropRect.x, cropRect.y - 5);

      if (currentCropMode === 'photo') drawHandles(cropRect, '#ff0000');
    }

    // Draw crop_number rectangle (blue)
    if (cropNumberRect.width > 0 && cropNumberRect.height > 0) {
      ctx.strokeStyle = '#0000ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropNumberRect.x, cropNumberRect.y, cropNumberRect.width, cropNumberRect.height);

      ctx.fillStyle = '#0000ff';
      ctx.font = '12px Arial';
      ctx.fillText('Number', cropNumberRect.x, cropNumberRect.y - 5);

      if (currentCropMode === 'number') drawHandles(cropNumberRect, '#0000ff');
    }
  };

  // Effect to redraw crop rectangles
  useEffect(() => {
    drawCropRect();
  }, [cropRect, cropNumberRect, currentCropMode]);

  let content;

  if (currentMode === 'list') {
    // List View
    content = (
      <TemplateListView
        photoTemplates={photoTemplates}
        onCreate={switchToCreateMode}
        onGenerate={switchToGenerateMode}
        onHistory={switchToHistoryMode}
        onEdit={switchToEditMode}
        onDuplicate={duplicateTemplate}
        onDelete={requestDelete}
      />
    );
  } else if (currentMode === 'history') {
    // History View
    content = (
      <HistoryView
        entries={historyEntries}
        onOpenArchive={openArchiveFolder}
        onBack={switchToListMode}
      />
    );
  } else if (currentMode === 'generate') {
    // Generation View
    content = (
      <TemplateGenerationView
        photoTemplates={photoTemplates}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={(template) => setSelectedTemplate(template)}
        selectedImageFolder={selectedImageFolder}
        onSelectFolder={selectImageFolder}
        selectedOutputFolder={selectedOutputFolder}
        onSelectOutputFolder={selectOutputFolder}
        preparation={preparation}
        numberOverrides={numberOverrides}
        onNumberOverrideChange={updateNumberOverride}
        previewImage={previewImage}
        isPreviewLoading={isPreviewLoading}
        onGeneratePreview={generatePreview}
        outputFormat={outputFormat}
        onOutputFormatChange={setOutputFormat}
        jpegQuality={jpegQuality}
        onJpegQualityChange={setJpegQuality}
        onGenerate={generateImages}
        onCancelGeneration={cancelGeneration}
        generationProgress={generationProgress}
        isGenerating={isGenerating}
        archivePath={archivePath}
        onDownload={downloadArchive}
        onBack={switchToListMode}
      />
    );
  } else {
    // Create/Edit Form View
    content = (
    <main className="container">
      <div className="header">
        <h1>{currentMode === 'create' ? 'Créer' : 'Modifier'} un Photo Template</h1>
        <button onClick={switchToListMode} className="btn btn-secondary">
          Retour à la liste
        </button>
      </div>

      {showOnboarding && (
        <div className="onboarding-banner">
          <p>
            <strong>Comment créer un template :</strong> donnez un nom et téléversez une
            image, puis choisissez "Zone Photo" et dessinez un rectangle à l'endroit où
            la photo sera insérée, faites de même pour "Zone Numéro", et affinez si
            besoin avec les poignées, les champs numériques ou le zoom.
          </p>
          <button type="button" className="btn btn-secondary" onClick={dismissOnboarding}>
            Compris, ne plus afficher
          </button>
        </div>
      )}

      <form className="photo-template-form" onSubmit={handleSubmit}>
        <div className="editor-layout">
          <div className="form-fields">
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
              <label htmlFor="category">Catégorie (optionnel):</label>
              <input
                id="category"
                name="category"
                type="text"
                value={formData.category}
                onChange={handleInputChange}
                placeholder="Ex: Diplômes, Badges..."
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label>Sélection des zones de recadrage:</label>
              <div className="crop-mode-buttons">
                <button
                  type="button"
                  onClick={() => setCurrentCropMode('photo')}
                  className={`btn ${currentCropMode === 'photo' ? 'btn-primary' : 'btn-secondary'}`}
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
              <p className="crop-mode-helper">
                Mode actuel: {currentCropMode === 'photo' ? 'Sélection zone photo' : 'Sélection zone numéro'}
              </p>
            </div>

            <div className="form-group">
              <label>Ajustement précis (en pixels):</label>
              <div className="coord-inputs">
                <label>
                  X
                  <input
                    type="number"
                    value={Math.round(activeRect.x)}
                    onChange={(e) => updateActiveRectField('x', Number(e.target.value))}
                    disabled={isLoading}
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    value={Math.round(activeRect.y)}
                    onChange={(e) => updateActiveRectField('y', Number(e.target.value))}
                    disabled={isLoading}
                  />
                </label>
                <label>
                  Largeur
                  <input
                    type="number"
                    value={Math.round(activeRect.width)}
                    onChange={(e) => updateActiveRectField('width', Number(e.target.value))}
                    disabled={isLoading}
                  />
                </label>
                <label>
                  Hauteur
                  <input
                    type="number"
                    value={Math.round(activeRect.height)}
                    onChange={(e) => updateActiveRectField('height', Number(e.target.value))}
                    disabled={isLoading}
                  />
                </label>
              </div>
            </div>

            {currentCropMode === 'number' && (
              <div className="form-group">
                <label>Apparence du numéro:</label>
                <div className="number-style-controls">
                  <label>
                    Couleur
                    <input
                      type="color"
                      value={cropNumberRect.color}
                      onChange={(e) => updateNumberColor(e.target.value)}
                      disabled={isLoading}
                    />
                  </label>
                  <label>
                    Taille ({Math.round(cropNumberRect.fontScale * 100)}%)
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={cropNumberRect.fontScale}
                      onChange={(e) => updateNumberFontScale(Number(e.target.value))}
                      disabled={isLoading}
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="template_img_upload">Image du template:</label>
              <input
                id="template_img_upload"
                name="template_img_upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="crop-preview-panel">
            <div className="crop-panel-header">
              <h2 className="crop-panel-title">Définition des cadrages</h2>
              <div className="zoom-controls">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setZoomLevel((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
                  disabled={zoomLevel <= MIN_ZOOM}
                >
                  −
                </button>
                <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setZoomLevel((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
                  disabled={zoomLevel >= MAX_ZOOM}
                >
                  +
                </button>
                {zoomLevel !== 1 && (
                  <button type="button" className="btn btn-secondary" onClick={() => setZoomLevel(1)}>
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
            {uploadedImage ? (
              <>
                <div className="image-crop-container">
                  <div className="crop-stage" style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}>
                    <img
                      src={uploadedImage}
                      alt="Template"
                      onLoad={(event) => {
                        const imgElement = event.currentTarget;
                        const canvas = canvasRef.current;
                        if (canvas) {
                          canvas.width = imgElement.clientWidth;
                          canvas.height = imgElement.clientHeight;
                          drawCropRect();
                        }
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                    />
                  </div>
                </div>
                <div className="crop-coordinates">
                  {cropRect.width > 0 && cropRect.height > 0 && (
                    <p className="photo-coords">
                      Zone Photo (Rouge): {Math.round(cropRect.x)}, {Math.round(cropRect.y)}, {Math.round(cropRect.width)}×{Math.round(cropRect.height)}
                    </p>
                  )}
                  {cropNumberRect.width > 0 && cropNumberRect.height > 0 && (
                    <p className="number-coords">
                      Zone Numéro (Bleu): {Math.round(cropNumberRect.x)}, {Math.round(cropNumberRect.y)}, {Math.round(cropNumberRect.width)}×{Math.round(cropNumberRect.height)}
                    </p>
                  )}
                  {cropRect.width === 0 && cropRect.height === 0 && cropNumberRect.width === 0 && cropNumberRect.height === 0 && (
                    <p className="empty-coords">
                      Aucune zone de recadrage définie. Utilisez les boutons ci-dessus pour choisir le mode, puis dessinez sur l'image.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="crop-placeholder">
                Téléchargez une image de template pour définir les zones de recadrage.
              </div>
            )}
          </div>
        </div>

        <input
          type="hidden"
          name="template_img"
          value={formData.template_img}
        />

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
    </main>
    );
  }

  return (
    <>
      <Toast message={message} onDismiss={() => setMessage("")} />
      {pendingDelete && (
        <ConfirmDialog
          title="Supprimer le template"
          message={`Êtes-vous sûr de vouloir supprimer le Photo Template "${pendingDelete.name}" ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {content}
    </>
  );
}

export default App;

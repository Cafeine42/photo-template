use diesel::prelude::*;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, Emitter};
use image::{DynamicImage, Rgba};
use std::io::Write;
use zip::{ZipWriter, write::FileOptions};
use walkdir::WalkDir;
use serde::{Deserialize, Serialize};
use regex::Regex;
use imageproc::drawing::{draw_text_mut, text_size};
use rusttype::{Font, Scale};
use base64::{engine::general_purpose, Engine as _};

pub mod models;
pub mod schema;

use models::{GenerationHistoryEntry, NewGenerationHistoryEntry, NewPhotoTemplate, PhotoTemplate};
use schema::{generation_history, photo_templates};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

const NUMBER_FONT_BYTES: &[u8] = include_bytes!("../fonts/DejaVuSans.ttf");

/// Shared flag checked during `generate_images_with_template` so a
/// long-running batch can be interrupted from `cancel_generation`.
pub struct GenerationCancelFlag(AtomicBool);

#[derive(Deserialize)]
struct CropCoordinates {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    /// Optional hex color ("#rrggbb") for the number text. Only meaningful for
    /// the crop_number zone; defaults to black when absent or unparseable.
    #[serde(default)]
    color: Option<String>,
    /// Optional multiplier applied to the auto-computed font size. Only
    /// meaningful for the crop_number zone; defaults to 1.0 when absent.
    #[serde(default, rename = "fontScale")]
    font_scale: Option<f32>,
}

fn parse_hex_color(input: &str) -> Option<Rgba<u8>> {
    let hex = input.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some(Rgba([r, g, b, 255]))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn add_photo_template_impl(
    connection: &mut SqliteConnection,
    new_template: NewPhotoTemplate,
) -> Result<PhotoTemplate, String> {
    // Insert the new template
    diesel::insert_into(photo_templates::table)
        .values(&new_template)
        .execute(connection)
        .map_err(|e| format!("Error inserting photo template: {}", e))?;

    // Get the last inserted record
    use diesel::sql_types::Integer;
    let last_insert_id: i32 = diesel::select(diesel::dsl::sql::<Integer>("last_insert_rowid()"))
        .get_result(connection)
        .map_err(|e| format!("Error getting last insert ID: {}", e))?;

    // Fetch and return the inserted record
    photo_templates::table
        .find(last_insert_id)
        .first(connection)
        .map_err(|e| format!("Error fetching inserted photo template: {}", e))
}

#[tauri::command]
fn add_photo_template(
    name: String,
    crop_photo: String,
    crop_number: String,
    template_img: String,
    category: String,
) -> Result<PhotoTemplate, String> {
    let mut connection = establish_connection();
    add_photo_template_impl(
        &mut connection,
        NewPhotoTemplate {
            name,
            crop_photo,
            crop_number,
            template_img,
            category,
        },
    )
}

fn get_photo_templates_impl(connection: &mut SqliteConnection) -> Result<Vec<PhotoTemplate>, String> {
    photo_templates::table
        .load::<PhotoTemplate>(connection)
        .map_err(|e| format!("Error loading photo templates: {}", e))
}

#[tauri::command]
fn get_photo_templates() -> Result<Vec<PhotoTemplate>, String> {
    let mut connection = establish_connection();
    get_photo_templates_impl(&mut connection)
}

fn update_photo_template_impl(
    connection: &mut SqliteConnection,
    id: i32,
    name: String,
    crop_photo: String,
    crop_number: String,
    template_img: String,
    category: String,
) -> Result<PhotoTemplate, String> {
    diesel::update(photo_templates::table.find(id))
        .set((
            photo_templates::name.eq(name),
            photo_templates::crop_photo.eq(crop_photo),
            photo_templates::crop_number.eq(crop_number),
            photo_templates::template_img.eq(template_img),
            photo_templates::category.eq(category),
        ))
        .execute(connection)
        .map_err(|e| format!("Error updating photo template: {}", e))?;

    // Return the updated record
    photo_templates::table
        .find(id)
        .first(connection)
        .map_err(|e| format!("Error fetching updated photo template: {}", e))
}

#[tauri::command]
fn update_photo_template(
    id: i32,
    name: String,
    crop_photo: String,
    crop_number: String,
    template_img: String,
    category: String,
) -> Result<PhotoTemplate, String> {
    let mut connection = establish_connection();
    update_photo_template_impl(&mut connection, id, name, crop_photo, crop_number, template_img, category)
}

fn delete_photo_template_impl(connection: &mut SqliteConnection, id: i32) -> Result<String, String> {
    let deleted_count = diesel::delete(photo_templates::table.find(id))
        .execute(connection)
        .map_err(|e| format!("Error deleting photo template: {}", e))?;

    if deleted_count > 0 {
        Ok(format!("Photo template with ID {} deleted successfully", id))
    } else {
        Err("Photo template not found".to_string())
    }
}

#[tauri::command]
fn delete_photo_template(id: i32) -> Result<String, String> {
    let mut connection = establish_connection();
    delete_photo_template_impl(&mut connection, id)
}

#[tauri::command]
async fn save_template_image(app_handle: AppHandle, file_data: Vec<u8>, filename: String) -> Result<String, String> {
    // Get app data directory
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Error getting app data directory: {}", e))?;
    
    // Create images directory if it doesn't exist
    let images_dir = app_data_dir.join("template_images");
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Error creating images directory: {}", e))?;
    
    // Generate unique filename with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let file_extension = Path::new(&filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("jpg");
    
    let unique_filename = format!("{}_{}.{}", timestamp, filename.replace('.', "_"), file_extension);
    let file_path = images_dir.join(&unique_filename);
    
    // Save file
    fs::write(&file_path, file_data)
        .map_err(|e| format!("Error saving file: {}", e))?;
    
    // Return the file path as string
    Ok(file_path.to_string_lossy().to_string())
}

async fn pick_folder_dialog(app_handle: &AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::{DialogExt};
    use std::sync::{Arc, Mutex};
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));

    app_handle.dialog()
        .file()
        .pick_folder(move |folder_path| {
            if let Ok(mut sender) = tx.lock() {
                if let Some(tx) = sender.take() {
                    let _ = tx.send(folder_path);
                }
            }
        });

    match rx.await {
        Ok(Some(path)) => Ok(path.to_string()),
        Ok(None) => Err("No folder selected".to_string()),
        Err(_) => Err("Dialog was cancelled".to_string()),
    }
}

#[tauri::command]
async fn select_image_folder(app_handle: AppHandle) -> Result<String, String> {
    pick_folder_dialog(&app_handle).await
}

#[tauri::command]
async fn select_output_folder(app_handle: AppHandle) -> Result<String, String> {
    pick_folder_dialog(&app_handle).await
}

#[tauri::command]
fn cancel_generation(cancel_flag: tauri::State<'_, GenerationCancelFlag>) {
    cancel_flag.0.store(true, Ordering::Relaxed);
}

#[derive(Serialize)]
struct GenerationEntryPreview {
    key: String,
    file_name: String,
    extracted_number: String,
}

#[derive(Serialize)]
struct GenerationPreparation {
    entries: Vec<GenerationEntryPreview>,
    skipped_subfolder_image_count: usize,
}

#[tauri::command]
fn prepare_generation(image_folder_path: String) -> Result<GenerationPreparation, String> {
    let image_files = find_image_files(&image_folder_path)?;

    let entries = image_files
        .iter()
        .enumerate()
        .map(|(index, path)| {
            let key = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let extracted_number = extract_number_from_filename(&key, index + 1);
            GenerationEntryPreview { key, file_name, extracted_number }
        })
        .collect();

    let skipped_subfolder_image_count = count_images_in_subfolders(&image_folder_path)?;

    Ok(GenerationPreparation { entries, skipped_subfolder_image_count })
}

#[tauri::command]
fn preview_generation_image(
    template_id: i32,
    image_folder_path: String,
    number_overrides: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let mut connection = establish_connection();
    let template: PhotoTemplate = photo_templates::table
        .find(template_id)
        .first(&mut connection)
        .map_err(|e| format!("Error loading template: {}", e))?;

    let crop_coords: CropCoordinates = serde_json::from_str(&template.crop_photo)
        .map_err(|e| format!("Error parsing crop coordinates: {}", e))?;
    let crop_number_coords: Option<CropCoordinates> = if !template.crop_number.is_empty() {
        Some(serde_json::from_str(&template.crop_number)
            .map_err(|e| format!("Error parsing crop_number coordinates: {}", e))?)
    } else {
        None
    };

    let template_image = load_image(&template.template_img)?;

    let image_files = find_image_files(&image_folder_path)?;
    let first_image = image_files
        .first()
        .ok_or_else(|| "No image files found in the selected folder".to_string())?;

    let source_image = load_and_resize_image(
        first_image,
        crop_coords.width as u32,
        crop_coords.height as u32,
        true,
    )?;

    let key = first_image.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let extracted_number = number_overrides
        .as_ref()
        .and_then(|overrides| overrides.get(key).cloned())
        .unwrap_or_else(|| extract_number_from_filename(key, 1));

    let result_image = composite_images_with_text(
        &template_image,
        &source_image,
        &crop_coords,
        crop_number_coords.as_ref(),
        &extracted_number,
    )?;

    encode_image_as_data_url(&result_image)
}

fn encode_image_as_data_url(image: &DynamicImage) -> Result<String, String> {
    let mut png_bytes: Vec<u8> = Vec::new();
    image
        .write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png)
        .map_err(|e| format!("Error encoding preview image: {}", e))?;

    Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&png_bytes)))
}

#[tauri::command]
async fn generate_images_with_template(
    app_handle: AppHandle,
    cancel_flag: tauri::State<'_, GenerationCancelFlag>,
    template_id: i32,
    image_folder_path: String,
    output_folder_path: Option<String>,
    number_overrides: Option<HashMap<String, String>>,
    output_format: Option<String>,
    jpeg_quality: Option<u8>,
) -> Result<String, String> {
    cancel_flag.0.store(false, Ordering::Relaxed);

    let output_format = match output_format.as_deref() {
        Some("png") => OutputFormat::Png,
        _ => OutputFormat::Jpeg,
    };
    let jpeg_quality = jpeg_quality.unwrap_or(90).clamp(1, 100);

    // 1. Get PhotoTemplate from database
    let mut connection = establish_connection();
    let template: PhotoTemplate = photo_templates::table
        .find(template_id)
        .first(&mut connection)
        .map_err(|e| format!("Error loading template: {}", e))?;

    // 2. Parse crop coordinates
    let crop_coords: CropCoordinates = serde_json::from_str(&template.crop_photo)
        .map_err(|e| format!("Error parsing crop coordinates: {}", e))?;

    // 2.1. Parse crop_number coordinates if available
    let crop_number_coords: Option<CropCoordinates> = if !template.crop_number.is_empty() {
        Some(serde_json::from_str(&template.crop_number)
            .map_err(|e| format!("Error parsing crop_number coordinates: {}", e))?)
    } else {
        None
    };

    // 3. Load template image
    let template_image = load_image(&template.template_img)?;

    // 4. Find all image files in the folder
    let image_files = find_image_files(&image_folder_path)?;
    if image_files.is_empty() {
        return Err("No image files found in the selected folder".to_string());
    }

    // 5. Create output directory for processed images
    let output_dir = match output_folder_path {
        Some(path) => PathBuf::from(path),
        None => {
            let app_data_dir = app_handle.path().app_data_dir()
                .map_err(|e| format!("Error getting app data directory: {}", e))?;
            app_data_dir.join("generated_images")
        }
    };
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Error creating output directory: {}", e))?;

    // 6. Process each image
    let mut processed_files = Vec::new();
    let total_images = image_files.len();

    for (index, image_file) in image_files.iter().enumerate() {
        if cancel_flag.0.load(Ordering::Relaxed) {
            return Err(format!(
                "Génération annulée après {} image(s) traitée(s) sur {}",
                index, total_images
            ));
        }

        // Load and resize source image
        let source_image = load_and_resize_image(
            image_file,
            crop_coords.width as u32,
            crop_coords.height as u32,
            true,
        )?;

        // Extract number from filename for text overlay, unless the user overrode it
        let filename = image_file.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let extracted_number = number_overrides
            .as_ref()
            .and_then(|overrides| overrides.get(filename).cloned())
            .unwrap_or_else(|| extract_number_from_filename(filename, index + 1));

        // Composite images with text overlay
        let result_image = composite_images_with_text(&template_image, &source_image, &crop_coords, crop_number_coords.as_ref(), &extracted_number)?;

        // Save result image - preserve original filename
        let original_filename = match image_file.file_stem().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => format!("image_{}", index + 1),
        };
        let output_filename = format!("{}_processed.{}", original_filename, output_format.extension());
        let output_path = output_dir.join(&output_filename);
        save_processed_image(&result_image, &output_path, output_format, jpeg_quality)?;

        processed_files.push(output_path);

        // Emit progress event
        let progress = (index + 1) as f32 / total_images as f32 * 100.0;
        app_handle.emit("generation-progress", progress).unwrap_or(());
    }

    // 7. Create ZIP archive
    let archive_path = create_archive(processed_files.clone(), &output_dir)?;

    // 8. Record this run in the generation history (best-effort, doesn't fail the whole run)
    let _ = record_generation_history_impl(
        &mut connection,
        NewGenerationHistoryEntry {
            template_name: template.name.clone(),
            archive_path: archive_path.clone(),
            image_count: processed_files.len() as i32,
            created_at: chrono::Local::now().to_rfc3339(),
        },
    );

    Ok(archive_path)
}

fn record_generation_history_impl(
    connection: &mut SqliteConnection,
    entry: NewGenerationHistoryEntry,
) -> Result<(), String> {
    diesel::insert_into(generation_history::table)
        .values(&entry)
        .execute(connection)
        .map_err(|e| format!("Error recording generation history: {}", e))?;
    Ok(())
}

fn get_generation_history_impl(
    connection: &mut SqliteConnection,
) -> Result<Vec<GenerationHistoryEntry>, String> {
    generation_history::table
        .order(generation_history::id.desc())
        .load::<GenerationHistoryEntry>(connection)
        .map_err(|e| format!("Error loading generation history: {}", e))
}

#[tauri::command]
fn get_generation_history() -> Result<Vec<GenerationHistoryEntry>, String> {
    let mut connection = establish_connection();
    get_generation_history_impl(&mut connection)
}

// Utility functions for image processing

#[derive(Clone, Copy)]
enum OutputFormat {
    Jpeg,
    Png,
}

impl OutputFormat {
    fn extension(&self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Png => "png",
        }
    }
}

fn save_processed_image(
    image: &DynamicImage,
    output_path: &Path,
    format: OutputFormat,
    jpeg_quality: u8,
) -> Result<(), String> {
    match format {
        OutputFormat::Png => image
            .save_with_format(output_path, image::ImageFormat::Png)
            .map_err(|e| format!("Error saving image: {}", e)),
        OutputFormat::Jpeg => {
            let mut file = fs::File::create(output_path)
                .map_err(|e| format!("Error creating output file: {}", e))?;
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, jpeg_quality);
            encoder
                .encode_image(image)
                .map_err(|e| format!("Error encoding jpeg: {}", e))
        }
    }
}

fn load_image(image_path: &str) -> Result<DynamicImage, String> {
    image::open(image_path)
        .map_err(|e| format!("Error loading image {}: {}", image_path, e))
}

fn find_image_files(folder_path: &str) -> Result<Vec<PathBuf>, String> {
    let mut image_files = Vec::new();
    let supported_extensions = ["jpg", "jpeg", "png", "bmp", "gif", "tiff"];
    
    for entry in WalkDir::new(folder_path).max_depth(1) {
        let entry = entry.map_err(|e| format!("Error walking directory: {}", e))?;
        
        if entry.file_type().is_file() {
            if let Some(extension) = entry.path().extension() {
                if let Some(ext_str) = extension.to_str() {
                    if supported_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        image_files.push(entry.path().to_path_buf());
                    }
                }
            }
        }
    }
    
    image_files.sort();
    Ok(image_files)
}

/// Counts image files located in subfolders of `folder_path` (depth >= 2),
/// which `find_image_files` deliberately ignores. Used to warn the user
/// instead of silently skipping them.
fn count_images_in_subfolders(folder_path: &str) -> Result<usize, String> {
    let supported_extensions = ["jpg", "jpeg", "png", "bmp", "gif", "tiff"];
    let mut count = 0;

    for entry in WalkDir::new(folder_path).min_depth(2) {
        let entry = entry.map_err(|e| format!("Error walking directory: {}", e))?;

        if entry.file_type().is_file() {
            if let Some(extension) = entry.path().extension() {
                if let Some(ext_str) = extension.to_str() {
                    if supported_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        count += 1;
                    }
                }
            }
        }
    }

    Ok(count)
}

fn load_and_resize_image(
    source_path: &Path,
    target_width: u32,
    target_height: u32,
    preserve_ratio: bool,
) -> Result<DynamicImage, String> {
    let img = image::open(source_path)
        .map_err(|e| format!("Error loading image {:?}: {}", source_path, e))?;
    
    if preserve_ratio {
        // Calculate the scaling factor to fit within target dimensions while preserving aspect ratio
        let (orig_width, orig_height) = (img.width(), img.height());
        let width_ratio = target_width as f32 / orig_width as f32;
        let height_ratio = target_height as f32 / orig_height as f32;
        let scale_ratio = width_ratio.min(height_ratio);
        
        let new_width = (orig_width as f32 * scale_ratio) as u32;
        let new_height = (orig_height as f32 * scale_ratio) as u32;
        
        Ok(img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3))
    } else {
        Ok(img.resize_exact(target_width, target_height, image::imageops::FilterType::Lanczos3))
    }
}

fn extract_number_from_filename(filename: &str, fallback_id: usize) -> String {
    let re = Regex::new(r"([0-9]+)").unwrap();
    if let Some(captures) = re.captures(filename) {
        if let Some(number_match) = captures.get(1) {
            return number_match.as_str().to_string();
        }
    }
    fallback_id.to_string()
}

fn composite_images_with_text(
    template_image: &DynamicImage,
    source_image: &DynamicImage,
    crop_coords: &CropCoordinates,
    crop_number_coords: Option<&CropCoordinates>,
    number: &str,
) -> Result<DynamicImage, String> {
    // First, composite the images normally
    let mut result = composite_images(template_image, source_image, crop_coords)?;
    
    // Add text overlay if crop_number coordinates are available
    if let Some(txt_crop) = crop_number_coords {
        // Always add text overlay - removed format detection that was causing the error
        // The original PHP logic for PNG detection is not critical for functionality
        result = add_text_overlay(result, txt_crop, number)?;
    }
    
    Ok(result)
}

fn add_text_overlay(
    image: DynamicImage,
    txt_crop: &CropCoordinates,
    number: &str,
) -> Result<DynamicImage, String> {
    let text = format!("N° {}", number);

    let font = Font::try_from_bytes(NUMBER_FONT_BYTES)
        .ok_or_else(|| "Error loading embedded number font".to_string())?;

    let mut rgba_image = image.to_rgba8();

    let color = txt_crop
        .color
        .as_deref()
        .and_then(parse_hex_color)
        .unwrap_or(Rgba([0u8, 0u8, 0u8, 255u8]));
    let font_scale = txt_crop.font_scale.unwrap_or(1.0).max(0.1);

    // Start from a font size close to the crop height, then shrink it so the
    // text still fits the crop width.
    let mut font_size = txt_crop.height.max(1.0) * 0.7 * font_scale;
    let mut scale = Scale::uniform(font_size);
    let mut text_width = text_size(scale, &font, &text).0 as f32;

    if text_width > txt_crop.width && text_width > 0.0 {
        font_size = (font_size * (txt_crop.width / text_width)).max(6.0);
        scale = Scale::uniform(font_size);
        text_width = text_size(scale, &font, &text).0 as f32;
    }

    let text_height = text_size(scale, &font, &text).1 as f32;

    // Center the text within the crop_number area.
    let text_x = (txt_crop.x + (txt_crop.width - text_width) / 2.0).max(0.0) as i32;
    let text_y = (txt_crop.y + (txt_crop.height - text_height) / 2.0).max(0.0) as i32;

    draw_text_mut(
        &mut rgba_image,
        color,
        text_x,
        text_y,
        scale,
        &font,
        &text,
    );

    Ok(DynamicImage::ImageRgba8(rgba_image))
}

fn composite_images(
    template_image: &DynamicImage,
    source_image: &DynamicImage,
    crop_coords: &CropCoordinates,
) -> Result<DynamicImage, String> {
    let mut result = template_image.clone();
    
    // Get the actual dimensions of the resized source image
    let source_width = source_image.width();
    let source_height = source_image.height();
    
    // Calculate the available space in the crop area
    let crop_width = crop_coords.width as u32;
    let crop_height = crop_coords.height as u32;
    
    // Calculate centering offsets
    let offset_x = if crop_width > source_width {
        (crop_width - source_width) / 2
    } else {
        0
    };
    
    let offset_y = if crop_height > source_height {
        (crop_height - source_height) / 2
    } else {
        0
    };
    
    // Calculate final centered position
    let centered_x = (crop_coords.x as u32 + offset_x) as i64;
    let centered_y = (crop_coords.y as u32 + offset_y) as i64;
    
    // Overlay the source image onto the template at the centered coordinates
    image::imageops::overlay(&mut result, source_image, centered_x, centered_y);
    
    Ok(result)
}

fn create_archive(images: Vec<PathBuf>, output_dir: &Path) -> Result<String, String> {
    let archive_path = output_dir.join("generated_images.zip");
    let file = fs::File::create(&archive_path)
        .map_err(|e| format!("Error creating archive file: {}", e))?;
    
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);
    
    for image_path in images.iter() {
        // Use the actual filename from the processed image path
        let filename = image_path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("processed_image.jpg");
        
        zip.start_file(filename, options)
            .map_err(|e| format!("Error starting zip file entry: {}", e))?;
        
        let image_data = fs::read(image_path)
            .map_err(|e| format!("Error reading image file: {}", e))?;
        
        zip.write_all(&image_data)
            .map_err(|e| format!("Error writing to zip: {}", e))?;
    }
    
    zip.finish()
        .map_err(|e| format!("Error finalizing zip: {}", e))?;
    
    Ok(archive_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn download_archive(app_handle: AppHandle, archive_path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    
    let path = Path::new(&archive_path);
    if !path.exists() {
        return Err("Archive file does not exist".to_string());
    }
    
    // Get the parent directory of the archive
    let parent_dir = path.parent()
        .ok_or("Cannot get parent directory of archive")?;
    
    // Open the folder containing the archive
    app_handle.opener()
        .open_path(parent_dir.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| format!("Error opening folder: {}", e))?;
    
    Ok(())
}

fn establish_connection() -> SqliteConnection {
    let database_url = "sqlite://photo_template.db";
    SqliteConnection::establish(database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}

fn run_migrations(connection: &mut SqliteConnection) {
    connection.run_pending_migrations(MIGRATIONS).unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Run database migrations on startup
    let mut connection = establish_connection();
    run_migrations(&mut connection);
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(GenerationCancelFlag(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![
            greet,
            add_photo_template,
            get_photo_templates,
            update_photo_template,
            delete_photo_template,
            save_template_image,
            select_image_folder,
            select_output_folder,
            prepare_generation,
            preview_generation_image,
            generate_images_with_template,
            cancel_generation,
            get_generation_history,
            download_archive
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn test_connection() -> SqliteConnection {
        let mut connection = SqliteConnection::establish(":memory:")
            .expect("failed to open in-memory sqlite database");
        connection
            .run_pending_migrations(MIGRATIONS)
            .expect("failed to run migrations");
        connection
    }

    fn sample_new_template(name: &str) -> NewPhotoTemplate {
        NewPhotoTemplate {
            name: name.to_string(),
            crop_photo: r#"{"x":0.0,"y":0.0,"width":10.0,"height":10.0}"#.to_string(),
            crop_number: r#"{"x":0.0,"y":0.0,"width":5.0,"height":5.0}"#.to_string(),
            template_img: "template.png".to_string(),
            category: "".to_string(),
        }
    }

    // --- CRUD (Diesel, in-memory sqlite) ---

    #[test]
    fn add_and_get_photo_template() {
        let mut connection = test_connection();
        let created = add_photo_template_impl(&mut connection, sample_new_template("Test")).unwrap();
        assert_eq!(created.name, "Test");

        let all = get_photo_templates_impl(&mut connection).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, created.id);
    }

    #[test]
    fn update_photo_template_changes_fields() {
        let mut connection = test_connection();
        let created = add_photo_template_impl(&mut connection, sample_new_template("Original")).unwrap();

        let updated = update_photo_template_impl(
            &mut connection,
            created.id,
            "Renamed".to_string(),
            created.crop_photo.clone(),
            created.crop_number.clone(),
            created.template_img.clone(),
            "Evenements".to_string(),
        )
        .unwrap();

        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.category, "Evenements");
    }

    #[test]
    fn delete_photo_template_removes_row() {
        let mut connection = test_connection();
        let created = add_photo_template_impl(&mut connection, sample_new_template("ToDelete")).unwrap();

        let message = delete_photo_template_impl(&mut connection, created.id).unwrap();
        assert!(message.contains("deleted successfully"));

        let all = get_photo_templates_impl(&mut connection).unwrap();
        assert!(all.is_empty());
    }

    #[test]
    fn delete_photo_template_missing_id_errors() {
        let mut connection = test_connection();
        let result = delete_photo_template_impl(&mut connection, 999);
        assert!(result.is_err());
    }

    // --- Number extraction ---

    #[test]
    fn extract_number_from_filename_finds_first_number() {
        assert_eq!(extract_number_from_filename("photo_042_final", 1), "042");
        assert_eq!(extract_number_from_filename("a1b2c3", 1), "1");
    }

    #[test]
    fn extract_number_from_filename_falls_back_without_digits() {
        assert_eq!(extract_number_from_filename("no-digits-here", 7), "7");
    }

    // --- Image folder discovery ---

    #[test]
    fn find_image_files_filters_by_extension_and_depth() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.jpg"), b"fake").unwrap();
        fs::write(dir.path().join("b.PNG"), b"fake").unwrap();
        fs::write(dir.path().join("c.txt"), b"fake").unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("d.jpg"), b"fake").unwrap();

        let files = find_image_files(dir.path().to_str().unwrap()).unwrap();
        let names: Vec<String> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert_eq!(names, vec!["a.jpg".to_string(), "b.PNG".to_string()]);
    }

    #[test]
    fn count_images_in_subfolders_ignores_top_level_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("top.jpg"), b"fake").unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("a.jpg"), b"fake").unwrap();
        fs::write(nested.join("b.png"), b"fake").unwrap();
        fs::write(nested.join("c.txt"), b"fake").unwrap();

        let count = count_images_in_subfolders(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn prepare_generation_lists_entries_and_warns_about_subfolders() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("photo_007.jpg"), b"fake").unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("ignored.jpg"), b"fake").unwrap();

        let preparation = prepare_generation(dir.path().to_str().unwrap().to_string()).unwrap();

        assert_eq!(preparation.entries.len(), 1);
        assert_eq!(preparation.entries[0].key, "photo_007");
        assert_eq!(preparation.entries[0].extracted_number, "007");
        assert_eq!(preparation.skipped_subfolder_image_count, 1);
    }

    // --- Generation history ---

    #[test]
    fn record_and_get_generation_history() {
        let mut connection = test_connection();

        record_generation_history_impl(
            &mut connection,
            NewGenerationHistoryEntry {
                template_name: "Diplôme".to_string(),
                archive_path: "/tmp/generated_images.zip".to_string(),
                image_count: 12,
                created_at: "2026-08-18T10:00:00+00:00".to_string(),
            },
        )
        .unwrap();

        let history = get_generation_history_impl(&mut connection).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].template_name, "Diplôme");
        assert_eq!(history[0].image_count, 12);
    }

    // --- Image resizing ---

    #[test]
    fn load_and_resize_image_preserves_aspect_ratio() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("source.png");
        let img = DynamicImage::new_rgba8(100, 50);
        img.save(&path).unwrap();

        let resized = load_and_resize_image(&path, 50, 50, true).unwrap();
        assert_eq!(resized.width(), 50);
        assert_eq!(resized.height(), 25);
    }

    // --- Compositing ---

    #[test]
    fn composite_images_centers_smaller_source_in_crop_area() {
        let mut template = DynamicImage::new_rgb8(20, 20);
        for pixel in template.as_mut_rgb8().unwrap().pixels_mut() {
            *pixel = image::Rgb([255, 255, 255]);
        }

        let mut source = DynamicImage::new_rgb8(4, 4);
        for pixel in source.as_mut_rgb8().unwrap().pixels_mut() {
            *pixel = image::Rgb([0, 0, 0]);
        }

        let crop = CropCoordinates {
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 10.0,
            color: None,
            font_scale: None,
        };
        let result = composite_images(&template, &source, &crop).unwrap();
        let rgb = result.to_rgb8();

        // 4x4 source centered in the 10x10 crop area => offset (3,3), spans [3,7)
        assert_eq!(rgb.get_pixel(3, 3), &image::Rgb([0, 0, 0]));
        assert_eq!(rgb.get_pixel(6, 6), &image::Rgb([0, 0, 0]));
        // Outside the source but inside the template, original color remains
        assert_eq!(rgb.get_pixel(0, 0), &image::Rgb([255, 255, 255]));
    }

    // --- Number text overlay ---

    #[test]
    fn add_text_overlay_draws_visible_text_in_crop_area() {
        let template = DynamicImage::new_rgba8(200, 100);
        let crop = CropCoordinates {
            x: 10.0,
            y: 10.0,
            width: 80.0,
            height: 30.0,
            color: None,
            font_scale: None,
        };

        let result = add_text_overlay(template, &crop, "42").unwrap();
        let rgba = result.to_rgba8();

        let mut has_ink = false;
        for y in (crop.y as u32)..((crop.y + crop.height) as u32) {
            for x in (crop.x as u32)..((crop.x + crop.width) as u32) {
                let pixel = rgba.get_pixel(x, y);
                if pixel[3] > 0 {
                    has_ink = true;
                    break;
                }
            }
        }

        assert!(has_ink, "expected the number text to draw at least one visible pixel in the crop area");
    }

    #[test]
    fn parse_hex_color_accepts_valid_hex_and_rejects_invalid() {
        assert_eq!(parse_hex_color("#ff0000"), Some(Rgba([255, 0, 0, 255])));
        assert_eq!(parse_hex_color("00ff00"), Some(Rgba([0, 255, 0, 255])));
        assert_eq!(parse_hex_color("not-a-color"), None);
        assert_eq!(parse_hex_color("#fff"), None);
    }

    #[test]
    fn add_text_overlay_uses_custom_color_and_font_scale() {
        let template = DynamicImage::new_rgba8(200, 100);
        let crop = CropCoordinates {
            x: 10.0,
            y: 10.0,
            width: 80.0,
            height: 30.0,
            color: Some("#00ff00".to_string()),
            font_scale: Some(1.5),
        };

        let result = add_text_overlay(template, &crop, "7").unwrap();
        let rgba = result.to_rgba8();

        // Some pixel in the crop area should carry the custom green color
        // (allowing for anti-aliasing, only the green channel is checked to
        // be dominant on at least one fully-opaque pixel).
        let mut found_green = false;
        for y in (crop.y as u32)..((crop.y + crop.height) as u32) {
            for x in (crop.x as u32)..((crop.x + crop.width) as u32) {
                let pixel = rgba.get_pixel(x, y);
                if pixel[3] == 255 && pixel[1] > pixel[0] && pixel[1] > pixel[2] {
                    found_green = true;
                }
            }
        }

        assert!(found_green, "expected the custom green color to appear in the rendered text");
    }

    #[test]
    fn save_processed_image_supports_png_and_jpeg() {
        let dir = tempdir().unwrap();
        let image = DynamicImage::new_rgb8(10, 10);

        let png_path = dir.path().join("out.png");
        save_processed_image(&image, &png_path, OutputFormat::Png, 90).unwrap();
        let reopened_png = image::open(&png_path).unwrap();
        assert_eq!(reopened_png.width(), 10);

        let jpg_path = dir.path().join("out.jpg");
        save_processed_image(&image, &jpg_path, OutputFormat::Jpeg, 50).unwrap();
        let reopened_jpg = image::open(&jpg_path).unwrap();
        assert_eq!(reopened_jpg.width(), 10);
    }

    // --- Archive creation ---

    #[test]
    fn create_archive_bundles_all_files() {
        let dir = tempdir().unwrap();
        let file1 = dir.path().join("one.jpg");
        let file2 = dir.path().join("two.jpg");
        fs::write(&file1, b"one-data").unwrap();
        fs::write(&file2, b"two-data").unwrap();

        let archive_path = create_archive(vec![file1, file2], dir.path()).unwrap();
        let archive_file = fs::File::open(&archive_path).unwrap();
        let mut zip = zip::ZipArchive::new(archive_file).unwrap();

        let mut names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();

        assert_eq!(names, vec!["one.jpg".to_string(), "two.jpg".to_string()]);
    }
}

// @generated automatically by Diesel CLI.

diesel::table! {
    photo_templates (id) {
        id -> Integer,
        name -> Text,
        crop_photo -> Text,
        crop_number -> Text,
        template_img -> Text,
    }
}

diesel::table! {
    generation_history (id) {
        id -> Integer,
        template_name -> Text,
        archive_path -> Text,
        image_count -> Integer,
        created_at -> Text,
    }
}
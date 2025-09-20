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
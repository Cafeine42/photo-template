use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Queryable, Selectable, Serialize, Deserialize, Debug)]
#[diesel(table_name = crate::schema::photo_templates)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct PhotoTemplate {
    pub id: i32,
    pub name: String,
    pub crop_photo: String,
    pub crop_number: String,
    pub template_img: String,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::photo_templates)]
pub struct NewPhotoTemplate {
    pub name: String,
    pub crop_photo: String,
    pub crop_number: String,
    pub template_img: String,
}
use crate::models::VolumeInformation;
use sysinfo::Disks;

/// Retrieves information about all system volumes/disks and returns it as a JSON string.
/// The information includes volume names, mount points, file systems, size, available space, etc.
///
/// # Returns
/// * `String` - A JSON string containing an array of volume information objects.
///
/// # Example
/// ```javascript
/// // From frontend JavaScript/TypeScript
/// import { invoke } from '@tauri-apps/api/tauri';
///
/// // Call the command
/// invoke('get_system_volumes_information_as_json')
///   .then((response) => {
///     // Parse the JSON string
///     const volumes = JSON.parse(response);
///     
///     // Display volume information
///     volumes.forEach(volume => {
///       console.log(`Volume: ${volume.volume_name}, Space: ${volume.available_space}/${volume.size}`);
///     });
///   })
///   .catch((error) => {
///     console.error('Error retrieving volume information:', error);
///   });
/// ```
#[tauri::command]
pub fn get_system_volumes_information_as_json() -> String {
    let volume_information_vec = get_system_volumes_information();
    serde_json::to_string(&volume_information_vec).unwrap()
}

/// Gets information about all system volumes/disks.
/// Collects detailed information such as volume names, mount points, file systems,
/// total and available space, and whether the volume is removable.
///
/// Notes:
/// - On Windows some volumes have an empty label (e.g. unnamed NTFS partitions).
///   Dedupe must therefore be based on `mount_point` (drive root) instead of `volume_name`,
///   otherwise multiple drives can be incorrectly collapsed into one.
///
/// # Returns
/// * `Vec<VolumeInformation>` - A vector of VolumeInformation structs, each containing
///   details about a single system volume or disk.
///
/// # Example
/// ```javascript
/// // From frontend JavaScript/TypeScript
/// import { invoke } from '@tauri-apps/api/tauri';
///
/// // Call the command
/// invoke('get_system_volumes_information')
///   .then((volumes) => {
///     // Process the volume information
///     volumes.forEach(volume => {
///       console.log(`Volume: ${volume.volume_name}, Mount: ${volume.mount_point}`);
///       console.log(`File System: ${volume.file_system}`);
///       console.log(`Space: ${volume.available_space}/${volume.size} bytes`);
///     });
///   })
///   .catch((error) => {
///     console.error('Error retrieving volumes:', error);
///   });
/// ```
#[tauri::command]
pub fn get_system_volumes_information() -> Vec<VolumeInformation> {
    let disks = Disks::new_with_refreshed_list();

    // Dedupe by mount point (drive root). Using `volume_name` is incorrect on Windows because
    // multiple distinct drives can share the same/empty label.
    let mut by_mount_point: std::collections::BTreeMap<String, VolumeInformation> =
        std::collections::BTreeMap::new();

    for disk in &disks {
        let mount_point = disk.mount_point().to_string_lossy().into_owned();

        let volume = VolumeInformation {
            volume_name: disk.name().to_string_lossy().into_owned(),
            mount_point: mount_point.clone(),
            file_system: disk
                .file_system()
                .to_str()
                .expect("Error during parsing the given string from file_system")
                .to_owned(),
            size: disk.total_space(),
            available_space: disk.available_space(),
            is_removable: disk.is_removable(),
            total_written_bytes: disk.usage().total_written_bytes,
            total_read_bytes: disk.usage().total_read_bytes,
        };

        match by_mount_point.get(&mount_point) {
            None => {
                by_mount_point.insert(mount_point, volume);
            }
            Some(existing) => {
                // Prefer entries that have a label/name.
                let existing_name_empty = existing.volume_name.trim().is_empty();
                let new_name_empty = volume.volume_name.trim().is_empty();

                if existing_name_empty && !new_name_empty {
                    by_mount_point.insert(mount_point, volume);
                }
            }
        }
    }

    by_mount_point
        .into_values()
        .filter(|volume| {
            // Keep the original intent of filtering boot volumes, but do it case-insensitively.
            let mp = volume.mount_point.to_lowercase();
            !(mp == "efi" || mp.contains("boot"))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::log_info;

    #[test]
    fn test_get_volumes() {
        let volumes = get_system_volumes_information();
        assert!(!volumes.is_empty(), "Should return at least one volume");

        let volumes_as_json = get_system_volumes_information_as_json();

        //printing the JSON string for debugging
        log_info!("Volumes as JSON: {}", volumes_as_json);

        for volume in &volumes {
            log_info!("{:?}", volume);
        }
    }
}

import { useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
export function useImage() {
 const [picking, setPicking] = useState(false);
 async function pick(camera = false) {
  setPicking(true);
  try {
   if (camera && Platform.OS !== 'web') { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) throw new Error('Bạn cần cho phép camera để chụp ảnh.'); }
   const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.8 };
   const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
   if (result.canceled) return null;
   const image = result.assets[0];
   if (image.fileSize && image.fileSize > 5 * 1024 * 1024) throw new Error('Chọn ảnh tối đa 5 MB.');
   return image;
  } finally { setPicking(false); }
 }
 return { pick, picking };
}
export async function imageForm(image: ImagePicker.ImagePickerAsset, field: string) {
 const form = new FormData();
 if (Platform.OS === 'web') { const blob = image.file || await (await fetch(image.uri)).blob(); form.append(field, blob, image.fileName || 'image.jpg'); }
 else form.append(field, { uri: image.uri, name: image.fileName || 'image.jpg', type: image.mimeType || 'image/jpeg' } as unknown as Blob);
 return form;
}

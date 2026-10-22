import { supabase } from './supabaseClient';

function requireWebsiteSession(organizationId) {
  if (!supabase || !organizationId) throw new Error('La sesión no tiene una organización Visual Corp activa.');
}

export async function saveWebsiteSettings(settings, organizationId) {
  requireWebsiteSession(organizationId);
  const { data, error } = await supabase.from('site_settings').update({
    slogan: settings.heroEyebrow.trim(),
    phone: settings.contactPhone.trim(),
    whatsapp: settings.contactPhone.trim(),
    address: settings.location.trim(),
    hero_kicker: settings.heroEyebrow.trim(),
    hero_title: settings.heroTitle.trim(),
    hero_text: settings.heroText.trim(),
    updated_at: new Date().toISOString(),
  }).eq('id', 'main').eq('organization_id', organizationId).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('No se encontró la configuración del sitio para guardar.');
}

export async function saveServiceVisibility(id, enabled, organizationId) {
  requireWebsiteSession(organizationId);
  const { data, error } = await supabase.from('services').update({
    is_published: enabled,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('organization_id', organizationId).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('No se encontró el servicio para actualizar.');
}

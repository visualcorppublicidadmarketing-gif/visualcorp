import { supabase } from './supabaseClient';

export async function saveWebsiteContent(settings, services, organizationId) {
  if (!supabase || !organizationId) throw new Error('La sesión no tiene una organización Visual Corp activa.');
  const [settingsResult, servicesResult] = await Promise.all([
    supabase.from('site_settings').upsert({
      id: 'main', organization_id: organizationId, brand: settings.name, slogan: settings.heroEyebrow || '',
      phone: settings.contactPhone || '', email: settings.email || '', address: settings.location || '',
      whatsapp: settings.contactPhone || '', hero_kicker: settings.heroEyebrow || '',
      hero_title: settings.heroTitle || '', hero_text: settings.heroText || '', updated_at: new Date().toISOString(),
    }, { onConflict: 'id' }),
    supabase.from('services').upsert((services || []).map((row, index) => ({
      id: row.id, organization_id: organizationId, name: row.name, short: row.description || '',
      detail: row.description || '', icon: 'sparkles', tag: 'Servicio Visual Corp',
      sort_order: index, is_published: row.enabled !== false, updated_at: new Date().toISOString(),
    })), { onConflict: 'id' }),
  ]);
  const error = settingsResult.error || servicesResult.error;
  if (error) throw error;
}

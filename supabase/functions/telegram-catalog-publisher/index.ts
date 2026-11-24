import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const editableBucket = 'catalog-product-editables';
const photoLimit = 5;
const documentLimit = 10;
const maxPhotoBytes = 700_000;
const maxDocumentBytes = 45 * 1024 * 1024;
const publicSite = 'https://visualcorp-suite.vercel.app';

type Target = 'public' | 'internal';
type Json = Record<string, unknown>;
type TelegramResponse = { ok: boolean; result?: any; description?: string; error_code?: number };

function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sanitizeError(value: unknown) {
  const text = String(value || 'No se pudo completar la solicitud.');
  return text.replace(/https?:\/\/\S+/gi, '[enlace]').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function asTarget(value: unknown): Target | null {
  return value === 'public' || value === 'internal' ? value : null;
}

function publicUrl(product: Record<string, any>) {
  const key = String(product.slug || product.id || '');
  return `${publicSite}/tienda?producto=${encodeURIComponent(key)}`;
}

function formatMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount)
    : 'Pendiente';
}

function buildCaption(product: Record<string, any>, target: Target) {
  const name = String(product.name || 'Producto').trim();
  const sku = String(product.sku || product.id || 'Pendiente').trim().slice(0, 100);
  const description = String(product.description || '').trim();
  const link = publicUrl(product);
  if (target === 'public') {
    const required = [name.slice(0, 140), `Código: ${sku}`, link].join('\n\n');
    const descriptionBudget = Math.max(0, 1024 - required.length - 4);
    return [name.slice(0, 140), description.slice(0, descriptionBudget), `Código: ${sku}`, link].filter(Boolean).join('\n\n');
  }

  const options = product.custom_options?.standard_details || {};
  const details = [
    options.materials && `Materiales: ${options.materials}`,
    options.colors && `Colores: ${options.colors}`,
    options.dimensions && `Medidas: ${options.dimensions}`,
    options.personalization && `Personalización: ${options.personalization}`,
  ].filter(Boolean);
  const tiers = Array.isArray(product.price_scales)
    ? product.price_scales
        .filter((tier: any) => tier && tier.qty != null && (tier.pvp != null || tier.price != null))
        .slice(0, 8)
        .map((tier: any) => `Desde ${tier.qty}: ${formatMoney(tier.pvp ?? tier.price)}`)
    : [];
  const required = [name.slice(0, 140), `Código: ${sku}`, `Precio base: ${formatMoney(product.price)}`, `Ficha pública: ${link}`];
  const optional = [
    product.price_inst != null ? `Con instalación: ${formatMoney(product.price_inst)}` : '',
    product.price_corp != null ? `Corporativo: ${formatMoney(product.price_corp)}` : '',
    tiers.length ? `Escalas:\n${tiers.join('\n')}` : '',
    description,
    ...details.map((detail: unknown) => String(detail)),
  ].filter(Boolean);
  let caption = required.join('\n\n');
  for (const block of optional) {
    const budget = 1024 - caption.length - 4;
    if (budget <= 0) break;
    const fitted = block.slice(0, budget);
    caption = `${caption}\n\n${fitted}`;
  }
  return caption;
}

function decodeDataUrl(value: unknown, expectedPrefix: string) {
  if (typeof value !== 'string' || !value.startsWith(expectedPrefix)) throw new Error('Falta una imagen preparada para Telegram.');
  const encoded = value.slice(value.indexOf(',') + 1);
  const binary = atob(encoded);
  if (!binary.length || binary.length > maxPhotoBytes) throw new Error('Una imagen preparada supera el límite permitido.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodePhotos(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > photoLimit) {
    throw new Error(`Prepara entre 1 y ${photoLimit} imágenes del producto.`);
  }
  return value.map((item, index) => {
    const photo = item as Record<string, unknown>;
    const bytes = decodeDataUrl(photo.dataUrl, 'data:image/jpeg;base64,');
    return { name: `producto-${index + 1}.jpg`, bytes };
  });
}

function fromBase64(value: unknown) {
  if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('El código QR o de barras supera el límite permitido.');
  const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('El QR y el código de barras deben llegar en PNG.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

async function telegramCall(token: string, method: string, body: Record<string, unknown> | FormData): Promise<TelegramResponse> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(35_000),
  });
  const payload = await response.json().catch(() => ({})) as TelegramResponse;
  if (!response.ok && payload.ok !== false) return { ok: false, description: 'Telegram rechazó la solicitud.' };
  return payload;
}

function channelUrl(channel: string, messageId: number) {
  if (channel.startsWith('@')) return `https://t.me/${channel.slice(1)}/${messageId}`;
  const compactId = channel.replace(/^-100/, '');
  return /^\d+$/.test(compactId) ? `https://t.me/c/${compactId}/${messageId}` : null;
}

async function getChannelStatus(token: string | undefined, chatId: string | undefined) {
  if (!token) return { ready: false, reason: 'Falta configurar TELEGRAM_BOT_TOKEN en Supabase.' };
  if (!chatId) return { ready: false, reason: 'Falta configurar el ID del canal en Supabase.' };
  const me = await telegramCall(token, 'getMe', {});
  if (!me.ok || !me.result?.id) return { ready: false, reason: 'El bot no pudo autenticarse. Revisa el token configurado.' };
  const chat = await telegramCall(token, 'getChat', { chat_id: chatId });
  if (!chat.ok || !chat.result?.id) return { ready: false, reason: 'Telegram no encontró el canal. Revisa el ID configurado.' };
  const member = await telegramCall(token, 'getChatMember', { chat_id: chatId, user_id: me.result.id });
  const role = member.result?.status;
  const isAdmin = role === 'administrator' || role === 'creator';
  if (!member.ok || !isAdmin || member.result?.can_post_messages === false) {
    return { ready: false, reason: 'Añade el bot como administrador del canal con permiso para publicar.' };
  }
  return { ready: true, title: String(chat.result.title || chat.result.username || 'Canal conectado') };
}

async function loadEditables(admin: SupabaseClient, organizationId: string, productId: string) {
  const folder = `${organizationId}/${productId}`;
  const { data, error } = await admin.storage.from(editableBucket).list(folder, {
    limit: documentLimit,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw new Error('No se pudieron leer los editables privados.');
  const files = (data || [])
    .filter((file: any) => file?.name && /\.(ai|psd)$/i.test(file.name))
    .map((file: any) => ({
      path: `${folder}/${file.name}`,
      name: String(file.name),
      updatedAt: String(file.updated_at || file.created_at || ''),
    }));
  if (files.length > documentLimit) throw new Error(`El límite es de ${documentLimit} editables por producto.`);
  return files;
}

async function sendPhotoAlbum(
  token: string,
  chatId: string,
  photos: Array<{ name: string; bytes: Uint8Array }>,
  caption: string,
  barcode?: Uint8Array,
  qr?: Uint8Array,
) {
  const mediaFiles: Array<{ attachName: string; name: string; bytes: Uint8Array }> = [
    ...photos.map((photo, index) => ({ attachName: `photo${index}`, name: photo.name, bytes: photo.bytes })),
    ...(barcode ? [{ attachName: 'barcode', name: 'codigo-barras.png', bytes: barcode }] : []),
    ...(qr ? [{ attachName: 'qr', name: 'codigo-qr.png', bytes: qr }] : []),
  ];
  const media = mediaFiles.map((file, index) => ({
    type: 'photo',
    media: `attach://${file.attachName}`,
    ...(index === 0 ? { caption } : {}),
  }));

  if (media.length === 1) {
    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('photo', new Blob([mediaFiles[0].bytes], { type: 'image/jpeg' }), mediaFiles[0].name);
    form.set('caption', caption);
    return telegramCall(token, 'sendPhoto', form);
  }

  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('media', JSON.stringify(media));
  for (const file of mediaFiles) {
    form.set(file.attachName, new Blob([file.bytes], { type: file.name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' }), file.name);
  }
  return telegramCall(token, 'sendMediaGroup', form);
}

async function updatePublication(admin: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from('catalog_product_telegram_publications').update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo guardar el resultado de Telegram.');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'La función no está configurada correctamente.' }, 500);

  try {
    const payload = await request.json() as Record<string, any>;
    const action = String(payload.action || '');
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const publicChannel = Deno.env.get('TELEGRAM_PUBLIC_CHANNEL_ID') || '@visualcorp_catalogo';
    const internalChannel = Deno.env.get('TELEGRAM_INTERNAL_CHANNEL_ID');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'La sesión venció. Inicia sesión de nuevo.' }, 401);

    if (action === 'status') {
      if (!token) return json({ configured: false, channels: { public: false, internal: false }, messages: { public: 'Falta el token del bot.', internal: 'Falta el token del bot.' } });
    const [publicStatus, internalStatus] = await Promise.all([
        getChannelStatus(token, publicChannel),
        getChannelStatus(token, internalChannel),
      ]);
      return json({
        configured: true,
        channels: { public: publicStatus.ready, internal: internalStatus.ready },
        messages: { public: publicStatus.reason || 'Canal listo.', internal: internalStatus.reason || 'Canal listo.' },
      });
    }

    if (action === 'discover_internal') {
      if (!token) return json({ error: 'Configura primero TELEGRAM_BOT_TOKEN en Supabase.' }, 400);
      const productId = String(payload.product_id || '');
      const { data: allowed, error: accessError } = await userClient.rpc('can_publish_catalog_product_to_telegram', {
        p_product_id: productId,
        p_target: 'internal',
      });
      if (accessError || allowed !== true) return json({ error: 'No tienes permiso para configurar publicaciones internas de este producto.' }, 403);
      const updates = await telegramCall(token, 'getUpdates', { limit: 100, allowed_updates: ['my_chat_member', 'channel_post'] });
      if (!updates.ok || !Array.isArray(updates.result)) {
        return json({ error: 'Telegram no pudo leer los avisos pendientes del bot. Comprueba que no tenga un webhook configurado.' }, 409);
      }
      const candidates = new Map<string, { id: string; title: string; type: string }>();
      for (const update of updates.result) {
        const chat = update.channel_post?.chat || update.my_chat_member?.chat;
        if (chat?.id && chat?.type === 'channel') candidates.set(String(chat.id), { id: String(chat.id), title: String(chat.title || 'Canal'), type: 'channel' });
      }
      return json({ candidates: [...candidates.values()] });
    }

    if (action === 'resolve_unknown') {
      const target = asTarget(payload.target);
      const productId = String(payload.product_id || '');
      const publicationId = String(payload.publication_id || '');
      if (!target || !productId || !publicationId) return json({ error: 'Falta identificar la publicación incierta.' }, 400);
      const { data: allowed, error: accessError } = await userClient.rpc('can_publish_catalog_product_to_telegram', {
        p_product_id: productId,
        p_target: target,
      });
      if (accessError || allowed !== true) return json({ error: 'Tu perfil no tiene permiso para resolver esta publicación.' }, 403);
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: publication, error: publicationError } = await admin.from('catalog_product_telegram_publications')
        .select('id,status,progress')
        .eq('id', publicationId)
        .eq('product_id', productId)
        .eq('target', target)
        .eq('status', 'unknown')
        .maybeSingle();
      if (publicationError || !publication) return json({ error: 'La publicación ya cambió o no existe.' }, 409);
      const progress = (publication.progress || {}) as Record<string, any>;
      for (const item of Object.values(progress.documents || {}) as Array<Record<string, unknown>>) {
        if (item.status === 'unknown') item.status = 'failed';
      }
      const nextStatus = progress.photos === 'sent' ? 'partial' : 'failed';
      const { error: updateError } = await admin.from('catalog_product_telegram_publications')
        .update({
          status: nextStatus,
          progress,
          error_message: 'Reintento autorizado después de revisar manualmente el canal.',
          actor_user_id: authData.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', publication.id)
        .eq('status', 'unknown');
      if (updateError) return json({ error: 'No se pudo habilitar el reintento.' }, 500);
      return json({ status: nextStatus, message: 'Reintento habilitado tras la revisión manual.' });
    }

    if (action !== 'publish') return json({ error: 'Acción desconocida.' }, 400);
    const target = asTarget(payload.target);
    const productId = String(payload.product_id || '');
    if (!target || !productId || productId.length > 200) return json({ error: 'Falta el producto o el canal de destino.' }, 400);

    const { data: allowed, error: accessError } = await userClient.rpc('can_publish_catalog_product_to_telegram', {
      p_product_id: productId,
      p_target: target,
    });
    if (accessError || allowed !== true) return json({ error: 'Tu perfil no tiene permiso para publicar este producto en ese canal.' }, 403);
    if (!token) return json({ error: 'Falta TELEGRAM_BOT_TOKEN en Supabase.' }, 503);
    const chatId = target === 'public' ? publicChannel : internalChannel;
    if (!chatId) return json({ error: 'Falta TELEGRAM_INTERNAL_CHANNEL_ID en Supabase.' }, 503);

    const photos = decodePhotos(payload.photos);
    const barcode = target === 'internal' ? fromBase64(payload.barcode) : undefined;
    const qr = target === 'internal' ? fromBase64(payload.qr) : undefined;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const productColumns = target === 'public'
      ? 'id,organization_id,sku,name,slug,description,category_id,subcategory,calc_type,is_published,images,image_url,product_kind,updated_at'
      : 'id,organization_id,sku,name,slug,description,category_id,subcategory,calc_type,price,price_inst,price_corp,price_scales,custom_options,is_published,images,image_url,product_kind,updated_at';
    const { data: product, error: productError } = await admin.from('catalog_products')
      .select(productColumns)
      .eq('id', productId)
      .eq('product_kind', 'standard_custom')
      .maybeSingle();
    if (productError || !product) return json({ error: 'No encontramos la ficha actual de este producto.' }, 404);
    if (target === 'public' && !product.is_published) return json({ error: 'El producto debe estar publicado en el sitio antes de enviarlo al canal público.' }, 409);

    const editables = target === 'internal'
      ? await loadEditables(admin, product.organization_id, productId)
      : [];
    const contentHash = await sha256({
      target,
      id: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      description: product.description,
      category_id: product.category_id,
      subcategory: product.subcategory,
      calc_type: product.calc_type,
      price: target === 'internal' ? product.price : undefined,
      price_inst: target === 'internal' ? product.price_inst : undefined,
      price_corp: target === 'internal' ? product.price_corp : undefined,
      price_scales: target === 'internal' ? product.price_scales : undefined,
      custom_options: target === 'internal' ? product.custom_options : undefined,
      images: product.images,
      image_url: product.image_url,
      updated_at: product.updated_at,
      editable_files: editables,
    });

    const { data: existing, error: existingError } = await admin.from('catalog_product_telegram_publications')
      .select('id,status,progress,message_link,error_message,updated_at')
      .eq('product_id', productId)
      .eq('target', target)
      .eq('content_hash', contentHash)
      .maybeSingle();
    if (existingError) throw new Error('No se pudo consultar el historial de publicaciones.');
    let publication = existing;
    if (publication?.status === 'published') return json({ status: 'published', message_link: publication.message_link, already_published: true });
    if (publication?.status === 'unknown' || publication?.status === 'sending') {
      const updatedAt = Date.parse(publication.updated_at || '');
      if (publication.status === 'sending' && Number.isFinite(updatedAt) && Date.now() - updatedAt > 300_000) {
        const { data: markedUnknown, error: markError } = await admin.from('catalog_product_telegram_publications')
          .update({ status: 'unknown', error_message: 'Telegram pudo haber recibido el mensaje; comprueba el canal antes de intentar de nuevo.', updated_at: new Date().toISOString() })
          .eq('id', publication.id)
          .eq('status', 'sending')
          .eq('updated_at', publication.updated_at)
          .select('id')
          .maybeSingle();
        if (markError) throw new Error('No se pudo actualizar el estado de Telegram.');
        if (!markedUnknown) return json({ status: 'sending', error: 'Otra solicitud sigue procesando esta publicación.' }, 409);
        return json({ status: 'unknown', error: 'La respuesta quedó incierta. Comprueba el canal para evitar publicar dos veces.' }, 409);
      }
      return json({ status: publication.status, error: 'La solicitud anterior aún se está procesando o su resultado es incierto.' }, 409);
    }
    if (!publication) {
      const { data: created, error: insertError } = await admin.from('catalog_product_telegram_publications')
        .insert({
          organization_id: product.organization_id,
          product_id: product.id,
          target,
          status: 'sending',
          content_hash: contentHash,
          progress: { photos: 'pending', documents: {} },
          actor_user_id: authData.user.id,
        })
        .select('id,status,progress,message_link,error_message,updated_at')
        .single();
      if (!insertError) publication = created;
      else if (insertError.code === '23505') {
        const { data: raced } = await admin.from('catalog_product_telegram_publications')
          .select('id,status,progress,message_link,error_message,updated_at')
          .eq('product_id', productId).eq('target', target).eq('content_hash', contentHash).maybeSingle();
        if (raced) return json({ status: raced.status, error: 'Ya hay una solicitud para este producto y canal.' }, 409);
        throw new Error('No se pudo reservar la publicación.');
      } else throw new Error('No se pudo registrar la publicación.');
    } else {
      const expectedStatus = publication.status;
      const { data: resumed, error: resumeError } = await admin.from('catalog_product_telegram_publications')
        .update({ status: 'sending', error_message: null, updated_at: new Date().toISOString(), actor_user_id: authData.user.id })
        .eq('id', publication.id)
        .eq('status', expectedStatus)
        .select('id')
        .maybeSingle();
      if (resumeError) throw new Error('No se pudo reanudar la publicación.');
      if (!resumed) return json({ status: 'sending', error: 'Otra solicitud ya está reanudando esta publicación.' }, 409);
      publication.status = 'sending';
    }
    if (!publication) throw new Error('No se pudo iniciar la publicación.');

    const progress = (publication.progress || { photos: 'pending', documents: {} }) as Record<string, any>;
    if (progress.photos !== 'sent') {
      let photoResult: TelegramResponse;
      try {
        photoResult = await sendPhotoAlbum(token, chatId, photos, buildCaption(product, target), barcode, qr);
      } catch (error) {
        await updatePublication(admin, publication.id, {
          status: 'unknown',
          progress,
          error_message: 'No sabemos si Telegram recibió las imágenes. Comprueba el canal antes de reintentar.',
        });
        return json({ status: 'unknown', error: 'No se pudo confirmar la respuesta de Telegram. Revisa el canal antes de volver a enviar.' }, 502);
      }
      if (!photoResult.ok) {
        await updatePublication(admin, publication.id, { status: 'failed', progress, error_message: sanitizeError(photoResult.description) });
        return json({ status: 'failed', error: 'Telegram rechazó las imágenes: ' + sanitizeError(photoResult.description) }, 502);
      }
      const messages = Array.isArray(photoResult.result) ? photoResult.result : [photoResult.result];
      progress.photos = 'sent';
      progress.photo_message_ids = messages.map((message: any) => message?.message_id).filter((id: unknown) => Number.isInteger(id));
      progress.documents = progress.documents || {};
      const firstMessageId = progress.photo_message_ids[0];
      const link = Number.isInteger(firstMessageId) ? channelUrl(chatId, firstMessageId) : null;
      publication.message_link = link;
      await updatePublication(admin, publication.id, {
        status: target === 'internal' && editables.length ? 'sending' : 'published',
        progress,
        message_link: link,
        error_message: null,
      });
      if (target === 'public' || editables.length === 0) {
        return json({ status: 'published', message_link: link });
      }
    }

    if (target === 'internal') {
      progress.documents = progress.documents || {};
      for (const editable of editables) {
        if (progress.documents[editable.path]?.status === 'sent') continue;
        const { data: file, error: downloadError } = await admin.storage.from(editableBucket).download(editable.path);
        if (downloadError || !file) {
          await updatePublication(admin, publication.id, { status: 'partial', progress, error_message: `No se pudo leer el editable ${editable.name}.` });
          return json({ status: 'partial', message_link: publication.message_link, error: `No se pudo leer el editable ${editable.name}.` }, 502);
        }
        if (file.size > maxDocumentBytes) {
          await updatePublication(admin, publication.id, { status: 'partial', progress, error_message: `El editable ${editable.name} supera 45 MiB.` });
          return json({ status: 'partial', message_link: publication.message_link, error: `El editable ${editable.name} supera 45 MiB.` }, 413);
        }
        let documentResult: TelegramResponse;
        try {
          const form = new FormData();
          form.set('chat_id', chatId);
          form.set('document', file, editable.name.replace(/^\d+_[a-f0-9-]+_/i, ''));
          form.set('caption', `Editable de ${product.name} · ${product.sku}`);
          documentResult = await telegramCall(token, 'sendDocument', form);
        } catch {
          progress.documents[editable.path] = { status: 'unknown' };
          await updatePublication(admin, publication.id, {
            status: 'unknown',
            progress,
            error_message: `La respuesta de Telegram sobre ${editable.name} es incierta. Comprueba el canal antes de reintentar.`,
          });
          return json({ status: 'unknown', message_link: publication.message_link, error: `No se pudo confirmar si Telegram recibió ${editable.name}. Revisa el canal antes de reintentar.` }, 502);
        }
        if (!documentResult.ok) {
          progress.documents[editable.path] = { status: 'failed' };
          await updatePublication(admin, publication.id, { status: 'partial', progress, error_message: sanitizeError(documentResult.description) });
          return json({ status: 'partial', message_link: publication.message_link, error: `Telegram no recibió ${editable.name}: ${sanitizeError(documentResult.description)}` }, 502);
        }
        progress.documents[editable.path] = { status: 'sent', message_id: documentResult.result?.message_id };
        await updatePublication(admin, publication.id, { status: 'sending', progress, error_message: null });
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
      const link = publication.message_link || null;
      await updatePublication(admin, publication.id, { status: 'published', progress, error_message: null });
      return json({ status: 'published', message_link: link });
    }

    return json({ status: 'published', message_link: publication.message_link || null });
  } catch (error) {
    return json({ error: sanitizeError(error instanceof Error ? error.message : error) }, 500);
  }
});

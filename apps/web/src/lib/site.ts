/** The public address of the site (landing page, sign-in, guest menus). Used for canonical links,
 *  the sitemap and social previews. Production: https://savora.menu. */
export const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? process.env.PUBLIC_MENU_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

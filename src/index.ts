/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;

		if (pathname === "/register") {
			// Handle DELETE request for removing redirects
			if (request.method === "DELETE") {
				const key = url.searchParams.get("key");
				if (!key) {
					return new Response("Missing key", { status: 400 });
				}
				await env.SHORT_URLS.delete(key);
				return new Response("Redirect deleted successfully!", { status: 200 });
			}

			// Handle POST request for new redirects
			if (request.method === "POST") {
				const formData = await request.formData();
				const shortPath = formData.get("shortPath");
				const targetUrl = formData.get("targetUrl");

				if (!shortPath || !targetUrl) {
					return new Response("Missing required fields", { status: 400 });
				}

				// Validate shortPath format
				if (!shortPath.toString().startsWith("/")) {
					return new Response("Short path must start with /", { status: 400 });
				}

				// Validate URL format
				try {
					new URL(targetUrl.toString());
				} catch {
					return new Response("Invalid target URL", { status: 400 });
				}

				// Store in KV
				await env.SHORT_URLS.put(shortPath.toString(), targetUrl.toString());
				return new Response("Redirect created successfully!", { status: 201 });
			}

			// Get all existing redirects
			const listObj = await env.SHORT_URLS.list();
			const redirectsPromises = listObj.keys.map(async key => {
				const targetUrl = await env.SHORT_URLS.get(key.name);
				return `
					<tr>
						<td>${key.name}</td>
						<td><a href="${targetUrl}" target="_blank">${targetUrl}</a></td>
						<td><button onclick="deleteRedirect('${key.name}')" class="delete-btn">Delete</button></td>
					</tr>
				`;
			});
			const redirectsList = (await Promise.all(redirectsPromises)).join('');

			// Show registration form and list
			const html = `<!DOCTYPE html>
            <html>
            <head>
                <title>Register New URL Redirect</title>
                <style>
                    body { max-width: 800px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
                    form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 30px; }
                    input { padding: 8px; }
                    button { padding: 10px; background: #0066ff; color: white; border: none; cursor: pointer; }
                    .delete-btn { background: #ff3333; padding: 5px 10px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <h1>Register New URL Redirect</h1>
                <form method="POST">
                    <div>
                        <label for="shortPath">Short Path (e.g., /blog):</label>
                        <input type="text" id="shortPath" name="shortPath" required>
                    </div>
                    <div>
                        <label for="targetUrl">Target URL:</label>
                        <input type="url" id="targetUrl" name="targetUrl" required>
                    </div>
                    <button type="submit">Create Redirect</button>
                </form>

                <h2>Existing Redirects</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Short Path</th>
                            <th>Redirect</th>
							<th> </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${redirectsList}
                    </tbody>
                </table>

                <script>
                    async function deleteRedirect(key) {
                        if (confirm('Are you sure you want to delete this redirect?')) {
                            const response = await fetch('/register?key=' + encodeURIComponent(key), {
                                method: 'DELETE'
                            });
                            if (response.ok) {
                                location.reload();
                            } else {
                                alert('Error deleting redirect');
                            }
                        }
                    }
                </script>
            </body>
            </html>`;

			return new Response(html, {
				headers: {
					"content-type": "text/html;charset=UTF-8",
				},
			});
		}

		const redirectURL = await env.SHORT_URLS.get(pathname);

		if (!redirectURL) {
			return new Response("Not Found", { status: 404 });
		}

		// Preserve query parameters from the original request
		const targetUrl = new URL(redirectURL);
		const originalParams = url.searchParams;

		// Add all original query parameters to the target URL
		originalParams.forEach((value, key) => {
			targetUrl.searchParams.set(key, value);
		});

		return Response.redirect(targetUrl.toString(), 301);
	},
};
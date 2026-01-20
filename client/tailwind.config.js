/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                emergency: {
                    red: '#dc2626',
                    dark: '#991b1b',
                    light: '#fecaca'
                }
            }
        },
    },
    plugins: [],
}

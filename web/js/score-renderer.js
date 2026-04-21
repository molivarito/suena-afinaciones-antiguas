/**
 * score-renderer.js - Renderiza partitura grabada usando Verovio (WASM).
 *
 * Verovio acepta nativamente kern (**kern/Humdrum), MEI, MusicXML (.xml y .mxl
 * comprimido), ABC y PAE. Genera SVG escalable y tambien puede exportar a MIDI
 * (base64), lo que usamos como fuente uniforme de eventos de audio.
 */

class ScoreRenderer {
    constructor() {
        this.toolkit = null;
        this.ready = this._initWhenReady();
    }

    _initWhenReady() {
        return new Promise((resolve, reject) => {
            const tryInit = () => {
                if (!window.verovio || !verovio.module) return false;
                // The wasm module exposes onRuntimeInitialized once-off.
                if (verovio.module.calledRun) {
                    this._makeToolkit();
                    resolve();
                    return true;
                }
                verovio.module.onRuntimeInitialized = () => {
                    this._makeToolkit();
                    resolve();
                };
                return true;
            };
            if (tryInit()) return;
            const iv = setInterval(() => {
                if (tryInit()) clearInterval(iv);
            }, 100);
            setTimeout(() => {
                clearInterval(iv);
                if (!this.toolkit) reject(new Error('Verovio no se cargo a tiempo'));
            }, 15000);
        });
    }

    _makeToolkit() {
        this.toolkit = new verovio.toolkit();
        this.toolkit.setOptions({
            inputFrom: 'auto',
            pageHeight: 2970,
            pageWidth: 2100,
            pageMarginTop: 50,
            pageMarginBottom: 50,
            pageMarginLeft: 50,
            pageMarginRight: 50,
            scale: 40,
            adjustPageHeight: true,
            svgViewBox: true,
            footer: 'none',
            header: 'none',
            breaks: 'auto',
            spacingNonLinear: 0.6,
            spacingLinear: 0.25,
        });
    }

    async loadText(data, format) {
        await this.ready;
        const fmtMap = { kern: 'humdrum', musicxml: 'musicxml', mei: 'mei', abc: 'abc' };
        const inputFrom = fmtMap[format] || 'auto';
        this.toolkit.setOptions({ inputFrom });
        const ok = this.toolkit.loadData(data);
        if (!ok) throw new Error('Verovio no pudo parsear los datos (' + inputFrom + ')');
    }

    async loadZipBase64(b64) {
        await this.ready;
        if (typeof this.toolkit.loadZipDataBase64 !== 'function') {
            throw new Error('Esta version de Verovio no soporta archivos comprimidos (.mxl)');
        }
        this.toolkit.loadZipDataBase64(b64);
    }

    async renderAllPagesSVG() {
        await this.ready;
        const pageCount = this.toolkit.getPageCount();
        let svg = '';
        for (let i = 1; i <= pageCount; i++) {
            svg += this.toolkit.renderToSVG(i, {});
        }
        return svg;
    }

    async renderToMIDI() {
        await this.ready;
        return this.toolkit.renderToMIDI();
    }

    /** Extrae metadatos (titulo, compositor) del archivo cargado. */
    async getMetadata() {
        await this.ready;
        try {
            const meiStr = this.toolkit.getMEI({});
            const parser = new DOMParser();
            const doc = parser.parseFromString(meiStr, 'application/xml');
            const title = doc.querySelector('titleStmt title')?.textContent?.trim() || '';
            const composer = doc.querySelector('titleStmt respStmt persName[role="composer"]')?.textContent?.trim()
                || doc.querySelector('titleStmt respStmt composer')?.textContent?.trim()
                || doc.querySelector('titleStmt composer')?.textContent?.trim()
                || '';
            return { title, composer };
        } catch (e) {
            return { title: '', composer: '' };
        }
    }
}

import { NextRequest, NextResponse } from "next/server";
import { analyzeZip, readUploadFile, ZipUploadError } from "@/lib/repo-intelligence/zip-upload";

export const maxDuration = 30;
const MAX_MULTIPART_BYTES = 51 * 1024 * 1024;

export async function POST(request: NextRequest) {
    try {
        const contentLength = Number(request.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
            return NextResponse.json({ error: "ZIP uploads must be 50 MB or smaller." }, { status: 413 });
        }
        const form = await request.formData();
        const upload = form.get("file");
        if (!(upload instanceof File)) return NextResponse.json({ error: "Choose a ZIP file to analyze." }, { status: 400 });
        const archive = await readUploadFile(upload);
        const result = await analyzeZip(archive, upload.name);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof ZipUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("ZIP repository analysis failed:", error);
        return NextResponse.json({ error: "The ZIP could not be analyzed. Check that it is a valid archive and try again." }, { status: 422 });
    }
}

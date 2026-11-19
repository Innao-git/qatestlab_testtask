import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import type { TestFile } from '../utils/testFiles';
import { endpoints } from './endpoints';
import type { ApiResponse, Attachment, AttachmentPayload } from './types';

/** Attachments of an employee (My Info → Attachments). */
export class AttachmentApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Builds the request body for a file: name, MIME type, size and base64 content. */
  static payload(file: TestFile, description?: string): AttachmentPayload {
    return {
      description,
      attachment: { name: file.name, type: file.mimeType, size: file.content.length, base64: file.content.toString('base64') },
    };
  }

  // Raw methods return the response untouched - use them for status-code / negative assertions.
  uploadRaw(empNumber: number, data: AttachmentPayload): Promise<APIResponse> {
    return this.request.post(endpoints.attachments(empNumber), { data });
  }

  listRaw(empNumber: number): Promise<APIResponse> {
    return this.request.get(endpoints.attachments(empNumber));
  }

  deleteRaw(empNumber: number, ids: number[]): Promise<APIResponse> {
    return this.request.delete(endpoints.attachments(empNumber), { data: { ids } });
  }

  downloadRaw(empNumber: number, attachmentId: number): Promise<APIResponse> {
    return this.request.get(endpoints.attachmentFile(empNumber, attachmentId));
  }

  // Convenience methods assert success and return parsed data - use them for setup and checks.
  async upload(empNumber: number, file: TestFile, description?: string): Promise<Attachment> {
    const res = await this.uploadRaw(empNumber, AttachmentApi.payload(file, description));
    expect(res, `upload attachment: ${await res.text()}`).toBeOK();
    return ((await res.json()) as ApiResponse<Attachment>).data;
  }

  async list(empNumber: number): Promise<Attachment[]> {
    const res = await this.listRaw(empNumber);
    expect(res).toBeOK();
    return ((await res.json()) as ApiResponse<Attachment[]>).data;
  }
}

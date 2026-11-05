# AGENTS.md — TN - DO

Hướng dẫn nhanh cho agent/dev mới. Đọc file này trước, sau đó mở các tài liệu gốc khi cần chi tiết.

## 1. Dự án là gì?

Ứng dụng web tiếng Việt để **quản lý lớp/học sinh, nhập đáp án nhiều mã đề, chấm phiếu trắc nghiệm bằng ảnh chụp và lưu kết quả sau khi giáo viên xác minh**.

- Frontend: React 19 + TypeScript + Vite 7.
- Cloud: Supabase (Auth, PostgreSQL + RLS, Storage private).
- Offline/local: IndexedDB (`idb`), không cần tài khoản, chỉ dùng một thiết bị.
- Nhận diện phiếu: OpenCV.js (contour, homography, adaptive threshold), OMR theo tọa độ template.
- QR: BarcodeDetector nếu có, ZXing dự phòng.
- Nhập/xuất: CSV, XLSX (SheetJS), JSON + Zod.
- Deploy: Vercel (`vercel.json`).

Repo: `https://github.com/thaydonet/tn-do`, nhánh chính `main`.

## 2. Môi trường & quy ước

- Windows + PowerShell. Dùng `npm.cmd` (không phải `npm`) để tránh lỗi execution policy.
- Node **24.x** (repo khai báo `engines`); npm và Chrome cài sẵn cho test trình duyệt.
- Chrome mặc định: `C:/Program Files/Google/Chrome/Application/chrome.exe`. Override bằng biến `CHROME_PATH`.
- File nguồn là UTF-8. PowerShell có thể hiển thị sai dấu tiếng Việt; dùng tool `read`/`grep` thay vì tin output console.
- `.env` không được track và **không được in/commit nội dung**. Chỉ dùng `.env.example` làm mẫu.
- Nhiều file UI/domain được viết rất cô đọng (nhiều biểu thức trên một dòng, có file chỉ vài chục dòng nhưng 10–14 KB). **Không format lại toàn file** khi sửa nhỏ; dùng `grep` + `edit` theo ngữ cảnh để giữ diff sạch.
- Không có Prettier và không có CI (`.github`) trong repo.

## 3. Lệnh thường dùng

```powershell
npm.cmd ci                 # cài dependency, chạy postinstall tạo public/vendor/opencv-4.11.0.js
npm.cmd run dev            # Vite dev server
npm.cmd run typecheck      # tsc -b
npm.cmd run lint           # eslint .
npm.cmd test               # vitest run (unit/domain)
npm.cmd run test:db        # PGlite: migrations + RLS/ACL thật
npm.cmd run test:import    # import CSV/XLSX/JSON
npm.cmd run test:browser   # Chrome headless: UI + OpenCV/ZXing + lưu ảnh/điểm
npm.cmd run test:camera    # camera/capture + analyze
npm.cmd run test:print     # kiểm tra file in
npm.cmd run test:forms-flow # luồng nâng cấp kỳ thi cũ sang mẫu in mới
npm.cmd run test:cloud     # chỉ kiểm tra cấu hình/asset với .env thật
npm.cmd run build          # tsc -b + vite build
npm.cmd run check          # chạy tuần tự các bước trên, dừng ở lỗi đầu tiên
npm.cmd run forms:print    # tạo lại PDF/SVG/PNG/JSON trong public/forms
npm.cmd run fixtures       # tạo lại ảnh mẫu trong public/fixtures
```

`test:cloud` cần `.env` có `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Nó **không** đăng nhập, không tạo tài khoản, không kiểm tra Storage thật; chỉ xác nhận trang login render và các asset tĩnh trả đúng status + content-type.

## 4. Bản đồ mã nguồn

| Đường dẫn | Vai trò |
| --- | --- |
| `src/App.tsx` | Shell, auth, chọn tổ chức, điều hướng, chế độ cloud/local |
| `src/ui/` | Các trang: `Dashboard`, `Classes`, `Exams`, `Templates`, `Scan`, `Reports`, `Settings`; `SheetAnalyzer`/`LiveSheetCamera` cho chấm ảnh |
| `src/domain/schemas.ts` | Nguồn sự thật của Zod: `SheetTemplate`, `AnswerDocument`, `Recognition`, `Workspace`… |
| `src/domain/templates.ts` | Template gốc, `legacyTemplates`, `largePrintTemplates`, `newestPrintTemplate`, seed mẫu |
| `src/domain/large-print-sheet.ts` | Sinh template A4 lề 25 mm, mốc ×1,5, ô SBD/mã đề ×2 từ template cũ |
| `src/domain/tnmaker-sheet.ts` | Mẫu TNMAKER-2026 (40 TN, 8 Đ/S, 6 TLN) |
| `src/domain/mixed-sheet.ts` + `mixed-answers.ts` | Mẫu 3 phần và chuẩn hóa đáp án đúng/sai, trả lời ngắn |
| `src/domain/sheet-renderer.ts` | Render SVG từ template; dùng cho preview và file in |
| `src/domain/omr-engine.ts` | Chấm ô từ pixel sau khi đã warp |
| `src/domain/image-preprocessor.ts` | Tìm 4 mốc, homography, grayscale/threshold |
| `src/domain/qr-reader.ts` | Đọc/validate QR metadata |
| `src/domain/template-matcher.ts` | Khớp template theo id/version và kiểm tra câu |
| `src/domain/answer-key-resolver.ts` | Chọn đúng mã đề trong `AnswerDocument` |
| `src/domain/grading-engine.ts` | Tính điểm client/server parity; MCQ, đúng/sai, trả lời ngắn |
| `src/domain/submission-storage.ts` | Encode ảnh, queue/finalize, idempotency |
| `src/domain/import-service.ts` | Import JSON/CSV/XLSX, phát hiện bố cục, xuất file |
| `src/lib/supabase.ts` | Tạo client từ `VITE_*`; `rpc()` wrapper |
| `src/lib/repository.ts` | Ranh giới cloud/local cho class, student, exam, template; seed template |
| `src/lib/local-db.ts` | IndexedDB, migrate từ `tnmaker-studio-v1`, lưu ảnh/queue |
| `supabase/migrations/` | 6 migration: schema, RPC, review/member, exam không lớp, chấm 3 phần, mẫu in lớn |
| `public/forms/` | File in phát hành: bản có version (`TNDO-A20-v2.*`) và alias mới nhất (`TNDO-A20.*`) |
| `scripts/` | Sinh fixture/form, test PostgreSQL/browser/camera/import/print/cloud, deploy Vercel |
| `tests/` | Vitest cho domain, schema, OMR, storage, migration, template seeding |

## 5. Luồng nghiệp vụ chính

1. Tạo lớp → thêm học sinh (`number` là chuỗi 1–12 chữ số, duy nhất trong tổ chức).
2. Tạo kỳ thi + đáp án nhiều mã đề. Tổng điểm mỗi mã đề phải bằng `exam.grading_scale`; lưu lần sau tạo version mới, cần xác nhận.
3. Chọn mẫu phiếu/version. Phiếu mới dùng lề 25 mm và template `largePrintTemplates`; không sửa hình học của version đã lưu.
4. Chấm: chọn kỳ thi → ảnh/camera → tìm 4 mốc → warp → OMR → đọc SBD/mã đề → giáo viên xác minh từng câu → lưu.
5. Cloud: server cấp draft/idempotency ID → upload 2 ảnh (`original.png`, `processed.png`) → `finalize_submission` kiểm tra ảnh, tự tính điểm, ghi answers/history/audit trong transaction.
6. Mất mạng: giữ draft + ảnh trong IndexedDB queue; gửi lại cùng UUID.

## 6. Bất biến không được phá

- **Template/exam version là bất biến.** Sửa thiết kế = tạo version mới; bài đã chấm giữ version cũ.
- Mỗi bài chỉ có một bản ghi `(exam_id, student_id)`; UUID lần chấm là khóa idempotency.
- Điểm do **server** tính từ đáp án chuẩn; không tin `score` client gửi lên.
- Không đưa đáp án/khóa bí mật vào QR phát cho học sinh.
- RLS là lớp bảo vệ thật; UI chỉ hỗ trợ. Client không có quyền INSERT/UPDATE/DELETE trực tiếp vào bảng dữ liệu.
- RPC `SECURITY DEFINER` phải giữ `search_path=''`, kiểm tra `auth.uid()`/membership/assignment và dùng tên bảng đầy đủ.
- Storage bucket `answer-sheets` là private; chỉ upload vào draft được cấp, không sửa/xóa ảnh đã upload.
- Không dùng service-role key trong frontend.
- `renderSheetSVG` được đưa vào `dangerouslySetInnerHTML`; mọi text từ template phải được escape (hiện renderer đã escape, nhưng đây vẫn là trust boundary nếu template do người ngoài kiểm soát).
- Khi đổi cấu trúc template/in, phải chạy `npm.cmd run forms:print` và cập nhật cả file version lẫn alias.

## 7. Trạng thái kiểm thử (05/11/2026)

Đã chạy trong workspace này:

| Lệnh | Kết quả |
| --- | --- |
| `typecheck` | PASS |
| `build` | PASS; chỉ warning PURE của Zod và chunk >500 kB |
| `test` | 107/107 PASS |
| `test:db` | 78 check PASS |
| `test:browser` | PASS |
| `test:camera` | PASS |
| `test:import` | PASS |
| `test:print` | PASS |
| `test:forms-flow` | PASS |
| `test:cloud` | PASS (đã siết kiểm tra content-type) |
| `lint` | PASS (đã ignore `artifacts/**`, `coverage/**`) |

Chưa có bằng chứng thực tế cho: in phiếu trên giấy thật, camera điện thoại thật, đăng nhập/upload/RLS bằng tài khoản Supabase thật.

## 8. Vấn đề đã biết / việc cần làm

1. **Alias file in bị xóa nhầm ở commit `106139d`.** `public/forms/TNDO-A20.*`, `TNDO-A40.*`, `TNDO-3P-2026.*` từng bị xóa trong khi test, README, docs và UI vẫn tham chiếu. `npm.cmd run forms:print` tạo lại chúng; hiện chúng đang là file **untracked** trong workspace. Cần `git add public/forms` và commit, hoặc đổi toàn bộ tham chiếu sang tên có version. Đây là lỗi chức năng thật, không chỉ là test.
2. **Không có CI.** `npm.cmd run check` là cổng kiểm tra duy nhất; nó dừng ở lỗi đầu tiên và không chạy `test:camera`, `test:cloud`.
3. **Chưa kiểm chứng Supabase thật.** Migrations/RLS được test bằng PGlite; Auth/Storage/production chỉ được kiểm tra endpoint.
4. **Chưa có bộ ảnh in thật/điện thoại thật.** Không được quảng bá độ chính xác thực tế.
5. **Bundle lớn.** `index` ~590 kB, `import-service` ~520 kB, `SheetAnalyzer` ~431 kB (chunk cảnh báo >500 kB). Có lazy-load theo trang nhưng vẫn nên theo dõi.
6. **File nguồn cô đọng, khó review.** Ưu tiên tách nhỏ khi sửa lớn; tránh reformat máy móc.
7. **Không có formatter config.** Nếu thêm, hãy chạy riêng một commit để không lẫn với thay đổi logic.

Chi tiết đánh giá và thứ tự ưu tiên: [`docs/CODEBASE-REVIEW.md`](docs/CODEBASE-REVIEW.md).

## 9. Tài liệu gốc nên đọc

- [`README.md`](README.md) — tổng quan, setup, luồng chấm, deploy.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module, versioning, idempotency, RLS/phân quyền.
- [`docs/FORMATS.md`](docs/FORMATS.md) — JSON đáp án/QR/template, CSV/XLSX, hiệu chỉnh mẫu.
- [`docs/THREE_PART_GRADING.md`](docs/THREE_PART_GRADING.md) — chấm 3 phần, migration, nhập Excel/CSV.
- [`docs/VERCEL.md`](docs/VERCEL.md) — deploy, biến môi trường, redirect Supabase.
- [`docs/DELIVERY.md`](docs/DELIVERY.md) — phạm vi bàn giao và giới hạn còn lại (một số số liệu đã cũ so với lần chạy mới).

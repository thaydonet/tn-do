# Đánh giá codebase TN - DO

Cập nhật: **05/11/2026** · Nhánh: `main` · Commit gần nhất khi đánh giá: `106139d fix v13`

Tài liệu này trả lời ba câu hỏi: **code có tốt không, dự án đã hoàn thành chưa, và cần sửa gì trước khi dùng thật**. Đọc kèm [`AGENTS.md`](../AGENTS.md) để nắm nhanh cấu trúc.

## 1. Kết luận ngắn

**Chất lượng code: tốt, trên mức MVP.** Kiến trúc tách lớp rõ, domain có test, bảo mật Supabase được thiết kế nghiêm túc (RLS + RPC + private Storage), và luồng nghiệp vụ chính đã chạy được end-to-end trong môi trường test.

**Mức hoàn thành: khoảng 85–90% cho một sản phẩm dùng nội bộ.** Các chức năng cốt lõi đã có; phần còn thiếu chủ yếu là **kiểm chứng thực tế** (giấy in, camera điện thoại, Supabase thật) và **hạ tầng chất lượng** (CI, formatter, xử lý regression file in).

**Chưa nên dùng cho kỳ thi thật ngay.** Cần hoàn tất các mục P0/P1 bên dưới, đặc biệt là khôi phục file in bị thiếu và chạy thử với ảnh in thật.

Điểm tham khảo (thang 10, mang tính tương đối):

| Tiêu chí | Điểm | Ghi chú |
| --- | --- | --- |
| Kiến trúc & tách lớp | 8.5 | Domain/UI/lib rõ ràng; vài file UI quá cô đọng |
| Độ đúng nghiệp vụ | 8.5 | Chấm điểm, versioning, idempotency được thiết kế kỹ |
| Bảo mật | 8.5 | RLS/ACL/RPC/private bucket tốt; chưa test trên Supabase thật |
| Kiểm thử | 8 | Nhiều tầng, có PGlite + Chrome thật; thiếu CI và ảnh thực |
| Khả năng bảo trì | 6.5 | File nén một dòng, không formatter, không CI |
| Sẵn sàng production | 6.5 | Phụ thuộc vào kiểm chứng thực tế và regression file in |

## 2. Bằng chứng đã chạy trong workspace

| Lệnh | Kết quả | Ghi chú |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | TypeScript strict |
| `npm.cmd run lint` | PASS | Sau khi ignore `artifacts/**`, `coverage/**` |
| `npm.cmd test` | **107/107 PASS** | 11 file test |
| `npm.cmd run test:db` | **78 check PASS** | PGlite chạy migrations + RLS/ACL thật |
| `npm.cmd run test:browser` | PASS | Chrome headless, UI + OpenCV/ZXing + lưu ảnh/điểm |
| `npm.cmd run test:camera` | PASS | Capture/analyze |
| `npm.cmd run test:import` | PASS | CSV/XLSX/JSON |
| `npm.cmd run test:print` | PASS | File in và hình học |
| `npm.cmd run test:forms-flow` | PASS | Nâng cấp kỳ thi cũ sang mẫu in mới |
| `npm.cmd run test:cloud` | PASS | Đã siết kiểm tra content-type |
| `npm.cmd run build` | PASS | Warning PURE của Zod + chunk >500 kB |

Kích thước bundle đáng chú ý:

- `index` ~590 kB (gzip ~172 kB)
- `import-service` ~520 kB (gzip ~170 kB, do SheetJS)
- `SheetAnalyzer` ~431 kB (gzip ~116 kB, do OpenCV)

Không có lỗi typecheck/lint trong mã nguồn. Các lỗi lint trước đây chỉ nằm trong script nháp `artifacts/qa-*.mjs` (đã gitignore), nay đã được loại khỏi phạm vi ESLint.

## 3. Điểm mạnh

### 3.1. Kiến trúc rõ ràng

- `src/domain/` chứa thuật toán thuần: QR, template matching, tiền xử lý ảnh, OMR, chấm điểm, import/export, render SVG.
- `src/ui/` chỉ điều phối giao diện; `src/lib/` là ranh giới Supabase/IndexedDB.
- Tọa độ OMR nằm trong template, không hard-code trong thuật toán. Đây là quyết định đúng, cho phép nhiều mẫu phiếu.
- `repository.ts` che giấu khác biệt cloud/local, giúp cùng một UI chạy ở hai chế độ.

### 3.2. Mô hình dữ liệu và versioning chắc

- `exams`/`answer_sheet_templates` là identity ổn định; `exam_versions`/`template_versions` bất biến.
- Bài đã chấm giữ template version và exam version cũ; sửa mẫu = tạo version mới.
- Mỗi bài có một bản ghi `(exam_id, student_id)`; UUID lần chấm là idempotency key.
- `finalize_submission` kiểm tra cả hai ảnh, tự tính điểm và ghi answers/history/audit trong một transaction.
- Client không được ghi điểm trực tiếp; điểm lấy từ đáp án chuẩn phía server.

### 3.3. Bảo mật được thiết kế đúng hướng

- 23 bảng đều bật RLS; client không có INSERT/UPDATE/DELETE trực tiếp.
- RPC `SECURITY DEFINER` đặt `search_path=''`, kiểm tra `auth.uid()`, membership và assignment.
- Phân quyền theo tổ chức/lớp/kỳ thi; viewer không nhận answer key.
- Storage bucket `answer-sheets` là private; upload vào đường dẫn do server cấp, ảnh đã upload là immutable.
- Không có service-role key trong frontend.
- Có audit log, invitation một lần, chống nâng quyền admin cuối cùng.

### 3.4. Kiểm thử nhiều tầng

- Unit/domain: 107 test.
- Database thật (PGlite): 78 check RLS/ACL/RPC, không cần Docker.
- Browser thật: tạo lớp/kỳ thi, đọc QR/OMR, lưu ảnh/điểm, xuất CSV, kiểm tra mobile 390 px.
- Import/print/camera/forms-flow có script riêng.
- Có test chống regression cho hình học phiếu in (lề 25 mm, mốc, bán kính ô).

### 3.5. Tài liệu tốt

README, ARCHITECTURE, FORMATS, THREE_PART_GRADING, VERCEL, DELIVERY đều có nội dung thực chất, mô tả cả giới hạn. Đây là điểm cộng lớn so với nhiều dự án cùng quy mô.

## 4. Điểm yếu và rủi ro

### P0 — Phải sửa trước khi coi là hoàn thành

#### 1. File in alias bị xóa nhưng vẫn được tham chiếu

Commit `106139d fix v13` đã xóa:

- `public/forms/TNDO-A20.{json,pdf,png,svg}`
- `public/forms/TNDO-A40.{json,pdf,png,svg}`
- `public/forms/TNDO-3P-2026.{json,pdf,png,svg}`

Trong khi vẫn còn tham chiếu ở:

- `tests/large-print-sheet.test.ts` — yêu cầu cả bản version và alias.
- `scripts/test-current-forms.mjs` — fetch `/forms/<code>.json` và `.png`.
- `src/ui/Templates.tsx` — thẻ mẫu 3 phần tải `/forms/TNDO-3P-2026.pdf|svg|png`.
- `README.md`, `docs/THREE_PART_GRADING.md`, `docs/VERCEL.md`, `scripts/test-cloud-config.mjs`.

Hệ quả:

- `npm test` fail (đã tái hiện: 1 failed / 106 passed trước khi khôi phục).
- `npm run test:forms-flow` fail vì Vite trả HTML fallback cho JSON.
- `test:cloud` từng **pass giả** vì chỉ kiểm tra status 200; Vite SPA fallback trả 200 + HTML cho file thiếu. Đã siết lại để kiểm tra content-type.

Cách sửa đã thực hiện một phần:

- Chạy `npm.cmd run forms:print` để tạo lại 12 file alias.
- `npm test`, `npm run test:forms-flow`, `npm run test:cloud` đã pass lại.

**Việc còn lại:** các file alias hiện là **untracked**. Cần commit chúng, hoặc nếu muốn bỏ alias thì phải đổi toàn bộ test/docs/UI sang tên có version và xóa logic copy trong `scripts/print-forms.mjs`.

Khuyến nghị: **giữ alias** vì URL ổn định có ích cho người dùng và script hiện tại đã cố ý tạo chúng; chỉ cần đảm bảo chúng luôn được commit cùng bản version.

#### 2. Chưa có CI

Không có `.github/workflows`. Cổng kiểm tra duy nhất là `scripts/check.mjs`, chạy tuần tự và dừng ở lỗi đầu tiên. Nó không chạy `test:camera` và `test:cloud`.

Rủi ro: regression như lần xóa file in có thể lọt vào `main` mà không ai biết.

Khuyến nghị: thêm GitHub Actions tối thiểu chạy `npm ci`, `typecheck`, `lint`, `test`, `test:db`, `build` trên push/PR. Có thể thêm job Chrome riêng nếu môi trường cho phép.

### P1 — Nên sửa sớm

#### 3. Chưa kiểm chứng Supabase thật

- Migrations/RLS được test bằng PGlite, không phải Supabase Postgres thật.
- Auth/Storage/production mới được kiểm tra endpoint, chưa đăng nhập/upload bằng tài khoản thật.
- `test:cloud` không tạo tài khoản, không gửi email, không kiểm tra bucket.

Rủi ro: khác biệt hành vi Auth/Storage gateway/RLS thật có thể chỉ lộ ra khi chạy staging.

Khuyến nghị: tạo project staging, chạy migrations, tạo 4 tài khoản (admin/teacher/examiner/viewer), test chéo tổ chức và upload/finalize/regrade thật.

#### 4. Chưa có kiểm chứng giấy in và camera điện thoại thật

- Chưa có bộ ảnh in thật theo manifest (thiết bị, độ phân giải, xoay, nghiêng, bóng đổ, tô nhạt, tẩy xóa).
- Chưa đo tỷ lệ nhận đúng template/SBD/mã đề/từng ô.
- Chưa test camera vật lý trên iOS/Android thật.

Rủi ro: hình học đúng trên SVG/PNG tổng hợp không bảo đảm đúng trên giấy hoặc ảnh chụp thực tế.

Khuyến nghị: in ít nhất 20 phiếu trên giấy A4 thật, chụp bằng 2–3 điện thoại, đo và ghi lại tỷ lệ; chỉ khi đó mới quảng bá độ chính xác.

#### 5. Test `test:cloud` giờ đã chặt hơn nhưng vẫn chỉ là smoke test

Đã sửa để kiểm tra content-type, nhưng test vẫn không xác nhận:
- Đăng nhập thành công.
- RLS chặn dữ liệu chéo tổ chức trên Supabase thật.
- Upload/finalize/Storage hoạt động.

Đừng dùng nó thay cho e2e staging.

### P2 — Cải thiện chất lượng dài hạn

#### 6. File nguồn quá cô đọng

Ví dụ:

- `src/App.tsx`: 41 dòng nhưng ~11.6 KB (nhiều JSX/expression trên một dòng).
- `src/ui/Templates.tsx`: 43 dòng, ~10.8 KB.
- `src/ui/Scan.tsx`: 93 dòng, ~14.4 KB.
- `src/ui/Exams.tsx`: 48 dòng, ~13.3 KB.

Hệ quả: khó review diff, khó đọc trong IDE, dễ conflict. Không nên reformat toàn bộ ngay lập tức vì sẽ tạo diff khổng lồ; hãy tách dần khi sửa từng màn hình.

#### 7. Không có formatter

Không có `.prettierrc`/script format. Nên thêm Prettier (hoặc Biome) và chạy trong một commit riêng, sau đó thêm vào CI. Trước mắt, giữ style hiện tại khi sửa nhỏ.

#### 8. Bundle lớn

- `index` ~590 kB.
- `import-service` ~520 kB do SheetJS.
- `SheetAnalyzer` ~431 kB do OpenCV.

Có lazy-load theo trang, nhưng lần đầu mở app vẫn tải `index`. Có thể:
- Tách vendor chunk (`manualChunks`) cho React/Supabase.
- Chỉ import SheetJS khi người dùng mở import/export.
- Kiểm tra xem OpenCV có cần tải sớm khi vào trang chấm hay không.

#### 9. Trust boundary của `dangerouslySetInnerHTML`

`renderSheetSVG` được đưa trực tiếp vào `dangerouslySetInnerHTML` trong `Templates.tsx` và preview. Renderer hiện escape text, nhưng nếu template do người ngoài kiểm soát (import JSON), cần coi đây là bề mặt tấn công. Khuyến nghị:
- Giữ escape tập trung trong renderer.
- Thêm test cho ký tự `<`, `>`, `&`, `"`, `'` trong `name`, `test_note`, nhãn câu.
- Cân nhắc sanitize/allowlist nếu cho phép import template từ nguồn không tin cậy.

#### 10. Tài liệu DELIVERY dễ lỗi thời

`docs/DELIVERY.md` là báo cáo bàn giao ngày 18/10/2026. Số liệu test và danh sách loại câu đã được cập nhật ngày 05/11/2026, nhưng các số liệu khác vẫn là ảnh chụp tại thời điểm bàn giao. Khi thay đổi lớn, hãy ghi rõ mốc thời gian thay vì coi đây là trạng thái hiện tại.

## 5. Mức hoàn thành theo nhóm chức năng

| Nhóm | Trạng thái | Ghi chú |
| --- | --- | --- |
| Auth + tổ chức + thành viên | Hoàn thành phần code | Chưa e2e Supabase thật |
| Lớp/học sinh + import CSV/XLSX | Hoàn thành | Có test |
| Kỳ thi/đáp án nhiều mã đề | Hoàn thành | Versioning, validation tốt |
| Template + thiết kế phiếu | Hoàn thành phần code | Cần kiểm chứng giấy in thật |
| Chấm ảnh/OMR/QR | Hoàn thành phần code | Cần ảnh thật/điện thoại thật |
| Chấm 3 phần (MCQ/Đ-S/TLN) | Hoàn thành | Có migration + test |
| Lưu cloud + idempotency + Storage | Hoàn thành phần code | Chưa test Supabase thật |
| Offline/IndexedDB + queue | Hoàn thành | Không có sync nền |
| Báo cáo/xuất CSV/XLSX | Hoàn thành | Có test |
| CI/CD | Thiếu | Chỉ có script check + Vercel deploy thủ công |
| Kiểm chứng thực tế | Thiếu | Đây là khoảng trống lớn nhất |

## 6. Thứ tự ưu tiên đề xuất

1. **Chốt file in alias**: `npm.cmd run forms:print`, kiểm tra `git status`, commit 12 file `public/forms/*` (hoặc đổi toàn bộ tham chiếu sang bản version).
2. **Thêm CI tối thiểu**: typecheck + lint + test + test:db + build trên PR.
3. **Chạy staging Supabase thật**: migrations, 4 role, upload/finalize/regrade, kiểm tra chéo tổ chức.
4. **Bộ ảnh in thật**: in giấy, chụp nhiều thiết bị, ghi manifest + tỷ lệ nhận đúng.
5. **Cập nhật DELIVERY/README** với số liệu mới và trạng thái đã có chấm 3 phần.
6. **Tách nhỏ dần các file UI lớn** khi có dịp sửa; thêm Prettier trong commit riêng.
7. **Tối ưu bundle** nếu người dùng mạng yếu hoặc dùng điện thoại.

## 7. Kết luận

Đây là một codebase **được thiết kế tốt và có kỷ luật**, không phải bản demo nửa vời: domain tách bạch, bảo mật có chủ đích, test nhiều tầng, tài liệu đầy đủ. Vấn đề lớn nhất hiện tại không phải logic mà là **regression file in chưa được commit** và **thiếu bằng chứng thực tế**. Sau khi xử lý P0/P1, dự án có thể tự tin dùng nội bộ; trước khi dùng cho kỳ thi thật, vẫn phải kiểm chứng trên giấy in và Supabase staging.

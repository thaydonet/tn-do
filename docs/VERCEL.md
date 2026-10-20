# Triển khai TN - DO lên Vercel

Dự án đã có `vercel.json`: framework **Vite**, Node.js **24.x**, cài đặt bằng `npm ci --include=dev`, build bằng `npm run build`, xuất thư mục `dist`. Rewrite SPA giữ trang hoạt động khi mở lại đường dẫn; các tệp thật trong `dist` vẫn được phục vụ trước rewrite, gồm PDF, ảnh và OpenCV.

## Deploy từ máy hiện tại

Chạy trong PowerShell tại `D:\cham-tn`:

```powershell
npm.cmd run vercel:check
npm.cmd run vercel:login
npm.cmd run deploy:vercel
```

`vercel:check` chỉ kiểm tra cấu hình frontend trong `.env`, không gửi dữ liệu lên mạng. `vercel:login` mở luồng đăng nhập Vercel. `deploy:vercel` dùng Vercel CLI phiên bản đã cố định, kiểm tra đăng nhập, liên kết/tạo project `tn-do` nếu thư mục chưa được liên kết, đồng bộ ba biến bên dưới vào môi trường Production rồi deploy. Lệnh in URL sau khi Vercel hoàn tất. Lần đầu cần mạng để tải CLI vào `.npm-cache`.

Tạo bản Preview bằng `npm.cmd run deploy:vercel -- --preview`. Lệnh này đồng bộ biến vào Preview thay vì Production. Nếu dùng nhóm, đặt `$env:VERCEL_SCOPE = 'ten-nhom'` trước khi chạy; đặt `$env:VERCEL_PROJECT_NAME = 'ten-project'` để chọn tên project khi liên kết lần đầu. Thư mục `.vercel` giữ liên kết cục bộ và được bỏ qua khi commit/upload.

## Deploy từ Git trên vercel.com

Đưa mã nguồn lên repository của bạn, vào **Add New → Project** trong Vercel và chọn repository. Root Directory là thư mục chứa `package.json` và `vercel.json`. Cấu hình build được đọc từ `vercel.json`.

Trong **Settings → Environment Variables**, thêm các giá trị từ `.env` cho Production và, nếu cần, Preview:

| Tên biến | Giá trị |
| --- | --- |
| `VITE_SUPABASE_URL` | URL HTTPS của dự án Supabase đang dùng |
| `VITE_SUPABASE_ANON_KEY` | Anon key hoặc publishable key của cùng dự án |
| `VITE_OPENCV_URL` | `/vendor/opencv-4.11.0.js` |

Nhấn **Deploy**. Khi thay biến, tạo deployment mới để Vite đưa giá trị mới vào bản build. `.env` không được upload; các biến `VITE_*` là cấu hình công khai của ứng dụng trình duyệt. Không dùng Supabase service-role/secret key hoặc đưa `TEST_DATABASE_URL` vào các biến frontend.

`postinstall` và `prebuild` tự tạo `public/vendor/opencv-4.11.0.js` từ dependency đã khóa phiên bản và checksum. Vercel cần cài cả devDependencies vì TypeScript, Vite và gói OpenCV nằm ở đó; cấu hình cài đặt đã bao gồm `--include=dev`.

## Kết nối Supabase sau khi có URL

Trong **Supabase → Authentication → URL Configuration**, đặt **Site URL** thành URL Production thực tế Vercel trả về, ví dụ `https://ten-project.vercel.app`, và thêm URL đó vào danh sách **Redirect URLs**. Thêm URL Preview cụ thể nếu dùng để kiểm tra đăng nhập/xác nhận email; giữ các URL môi trường khác nếu vẫn sử dụng chúng. Xem [hướng dẫn redirect của Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Deploy Vercel không chạy migrations của Supabase. Với dự án đã chạy ba migration ngày 18/10/2026, áp dụng thêm `supabase/migrations/202610200001_optional_exam_class_and_question_scope.sql` trong Supabase SQL Editor để lưu kỳ thi không có lớp và đề ít câu hơn sức chứa phiếu. Để chấm phần II đúng–sai và phần III trả lời ngắn, áp dụng tiếp `supabase/migrations/202610200002_three_part_grading.sql`, rồi bổ sung mẫu TN - DO 2026 v2 trong ứng dụng. Xem [hướng dẫn ba phần](THREE_PART_GRADING.md). Với database mới, chạy toàn bộ migration theo thứ tự tên.

Sau deploy, kiểm tra trang đăng nhập, `/about.html`, `/forms/TNDO-A20.pdf`, `/forms/TNDO-A40.pdf` và `/vendor/opencv-4.11.0.js`. Các đường dẫn tài nguyên phải trả đúng tệp thay vì nội dung HTML của ứng dụng.

Bộ phiếu lề 2,5 cm dùng 20/40 câu v2 và ba phần v3. Áp dụng tiếp `supabase/migrations/202610200003_large_print_templates.sql`, bổ sung phiên bản trong thư viện mẫu và chọn đúng phiên bản cho kỳ thi. Tạo lại PDF/SVG/PNG/JSON bằng `npm.cmd run forms:print` trước khi build nếu thay bố cục. Lề đã có sẵn trong PDF; in A4 ở 100%, không co vừa trang hoặc thêm lề.

Tài liệu chính thức: [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite), [cấu hình vercel.json](https://vercel.com/docs/project-configuration/vercel-json), [Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [biến môi trường qua CLI](https://vercel.com/docs/cli/env), [các tệp bỏ qua khi deploy](https://vercel.com/docs/deployments/vercel-ignore).

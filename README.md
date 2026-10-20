# TN - DO

TN - DO lấy ý tưởng về quy trình chấm phiếu từ TNMaker; tên ứng dụng, giao diện và các phiếu được thiết kế riêng cho dự án. Thông tin này không thể hiện sự liên kết hoặc bảo trợ của thương hiệu đó. Ghi nhận nguồn ý tưởng tại `public/about.html`.

## Phiếu TN - DO ba phần 2026

Mẫu mới theo cấu trúc ảnh tham chiếu của người dùng, với bố cục TN - DO: **40 câu trắc nghiệm A–D, 8 câu đúng–sai (4 ý/câu), 6 câu trả lời ngắn (4 cột chữ số/câu, dấu âm và dấu thập phân riêng)**. Số báo danh 8 chữ số, mã đề 4 chữ số.

- [PDF A4 để in](public/forms/TNDO-3P-2026.pdf)
- [SVG vector](public/forms/TNDO-3P-2026.svg)
- [PNG xem trước](public/forms/TNDO-3P-2026.png)
- [JSON bố cục](public/forms/TNDO-3P-2026.json)

Mở **Mẫu phiếu** để xem và tải. Bộ mới có lề 2,5 cm bốn phía, mốc đen lớn ×1,5 và đường kính ô tô SBD/mã đề lớn ×2. In A4 ở tỷ lệ 100%, không thêm lề/co vừa trang lần nữa. Chọn **TN - DO 2026 · v3** khi tạo kỳ thi với bản in mới (v2 vẫn dùng bố cục cũ). Đúng–sai mặc định tính 10%/25%/50%/100% điểm câu theo 1/2/3/4 ý đúng; trả lời ngắn hỗ trợ số âm và thập phân. Xem [hướng dẫn chấm ba phần](docs/THREE_PART_GRADING.md), gồm migration Supabase và nhập Excel/CSV. Tái tạo cả ba phiếu bằng `npm.cmd run forms:print`.

Hai mẫu MCQ riêng: [20 câu v2](public/forms/TNDO-A20.pdf) và [40 câu v2](public/forms/TNDO-A40.pdf) (kèm SVG, PNG, JSON). Phiên bản in mới giữ cùng mã mẫu và tăng phiên bản; phiếu và bài chấm cũ không bị thay đổi tọa độ. Với Supabase, cần migration `202610200003_large_print_templates.sql` rồi bổ sung mẫu trong ứng dụng. IndexedDB tự bổ sung phiên bản mới, giữ cả ảnh và bản chờ gửi.

## Trạng thái kết nối hiện tại

Cấu hình người dùng cung cấp đã chuyển vào `.env` không theo dõi trong Git. `.env.example` được trả về chỗ trống. Đã kiểm tra Supabase Auth HTTP 200, đăng nhập email bật, bảng mẫu có tồn tại và năm RPC chính tồn tại/chặn khóa ẩn danh bằng HTTP 401. Không tự tạo tài khoản hoặc gửi email để thử.

Kiểm tra này không thay thế kiểm thử đăng nhập/chấm/upload bằng một tài khoản thật hoặc kiểm tra SQL bằng quyền quản trị. Chưa thực thi SQL lên Supabase bằng anon key; các migrations hiện có vẫn được giữ nguyên. Thông tin đã khử khóa tại `artifacts/supabase-status.json` và `artifacts/cloud-ui-check.json`.

Site đã đăng ký với tên **TN - DO**, địa chỉ `https://tn-do.livelyboot512.chatgpt.site`, mặc định riêng tư. Kết quả xuất bản được ghi trong `artifacts/deployment.json` khi có phản hồi từ dịch vụ.

Ứng dụng React 19 + TypeScript + Supabase để quản lý lớp, nhập đáp án nhiều mã đề, nhận diện phiếu bằng OpenCV.js và lưu kết quả sau khi giáo viên xác minh.

## Chạy tại máy

Triển khai lên **Vercel** đã được cấu hình trong `vercel.json`. Chạy `npm.cmd run vercel:check`, đăng nhập bằng `npm.cmd run vercel:login`, rồi chạy `npm.cmd run deploy:vercel`. Lệnh deploy đồng bộ ba biến frontend từ `.env` vào Vercel và xuất bản Production; `.env` được bỏ qua khi upload. Hướng dẫn Git/CLI, Preview và Supabase redirect: [docs/VERCEL.md](docs/VERCEL.md).

Yêu cầu Node.js 22.12+ (đã kiểm tra trên Node 24), npm và Chrome cho kiểm thử trình duyệt.

```powershell
cd D:\cham-tn
npm.cmd ci
npm.cmd run dev
```

Mở địa chỉ Vite in ra, thường là `http://localhost:5173`. Chưa có `.env` sẽ chạy **chế độ cục bộ**, lưu dữ liệu và ảnh trong IndexedDB. Chế độ này dành cho phát triển và kiểm tra trên một thiết bị; không có phân quyền nhiều người dùng. Không tự chuyển dữ liệu cục bộ lên cloud khi thêm `.env`. Tránh xóa dữ liệu trình duyệt khi còn bài đang chờ gửi.

OpenCV 4.11.0 được khóa phiên bản trong `package-lock.json`; `postinstall` tự chép thư viện và giấy phép vào `public/vendor`. Nhận diện không cần CDN. Font có bộ chữ hệ thống dự phòng. Có thể thay URL OpenCV bằng `VITE_OPENCV_URL` nếu tự lưu trữ phiên bản khác đã kiểm thử.

## Kết nối Supabase

1. Tạo dự án Supabase. Trong SQL Editor, chạy lần lượt các tệp trong `supabase/migrations` theo thứ tự tên. Hoặc dùng Supabase CLI với `supabase link --project-ref ...` và `supabase db push`.
2. Bật Email/Password trong Authentication; cấu hình Site URL và redirect URL cho địa chỉ ứng dụng. Cấu hình email xác nhận/SMTP theo môi trường triển khai.
3. Sao chép `.env.example` thành `.env`. Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (anon/publishable key của dự án). **Không dùng Service Role Key trong frontend.** Khởi động lại Vite.
4. Đăng ký, xác nhận email nếu được yêu cầu, đăng nhập và tạo tổ chức. Người tạo nhận vai trò `school_admin`.
5. Vào **Thành viên** để tạo mã mời một lần, chọn vai trò và tự chuyển mã cho người nhận. Ứng dụng không tự gửi email lời mời. Người nhận đăng nhập rồi nhập mã; người đã có tổ chức cũng có thể tham gia tổ chức khác tại trang Thành viên.
6. Vào **Mẫu phiếu**, thêm các mẫu phát triển; hoặc nhập cấu hình JSON của mẫu thực tế. Quản trị viên quản lý phiên bản mẫu, thử ảnh và kích hoạt khi đã kiểm chứng.
7. Tạo lớp, phân công giáo viên, thêm học sinh, tạo kỳ thi và đáp án. UUID thành viên hiện ở trang Thành viên. Số báo danh được lưu dạng chuỗi, duy nhất trong mỗi tổ chức.

`platform_admin` được cấp bởi quản trị hạ tầng trong SQL Editor, không có nút tự nâng quyền:

```sql
insert into public.platform_admins(user_id) values ('UUID_AUTH_USER');
```

Bucket `answer-sheets` được tạo private trong migration. Mỗi bài dùng đường dẫn do server cấp: `organization_uuid/submission_uuid/original.png` và `processed.png`. RLS chỉ cho phép upload vào draft được giao, không cho client sửa hoặc xóa ảnh đã upload. Chỉ người được phân quyền kỳ thi mới nhận URL ký hạn 120 giây.

## Luồng chấm đầu cuối

1. **Lớp học:** tạo lớp, thêm danh sách `SBD, họ tên`, hoặc mở CSV/XLSX có cột `number,name`, kiểm tra và xác nhận thêm. Định dạng cột SBD trong Excel là Text để giữ số 0 đầu.
2. **Mẫu phiếu:** chọn đúng cấu hình/phiên bản. Các mẫu `TNDO-A20` và `TNDO-A40` có bố cục riêng và ảnh tổng hợp để phát triển; cần kiểm chứng bằng bản in thực tế. Nếu tổ chức đã có mẫu cũ, dùng nút **Thêm bộ phiếu TN - DO 20 và 40 câu** để thêm các mẫu mới mà không sửa phiên bản cũ.
3. **Kỳ thi & đáp án:** nhập tên/môn/ngày/mẫu; lớp là tùy chọn. Số câu của đề có thể ít hơn sức chứa phiếu: đề 10 câu dùng được phiếu 20 hoặc 40 câu, chỉ chấm câu 1–10. Nhập A–E bằng bàn phím trong lưới, thêm phần và mã đề; hoặc import CSV/XLSX sau khi ánh xạ cột/xem trước; hoặc kiểm tra và áp dụng JSON. Tổng điểm từng mã đề phải bằng thang điểm (ví dụ 10 câu × 1 điểm = 10). Lưu lần sau tạo phiên bản mới, cần xác nhận và không thay đổi điểm bài cũ. Không chọn lớp thì chọn học sinh trong danh sách có quyền truy cập khi chấm.

   Trong tab **Excel / CSV**, có thể nhập thẳng bảng có **mã đề ở hàng đầu, số câu ở cột đầu**, các ô chứa đáp án A–D. Ứng dụng tự nhận diện bố cục, xem trước từng cột và chia đều điểm theo thang điểm đã chọn. Nút **Xác nhận áp dụng dữ liệu** đưa đáp án vào bản nháp để kiểm tra trước khi lưu. Nút tải mẫu XLSX/CSV cũng dùng bố cục này; mẫu CSV 4 mã đề × 10 câu tại `public/fixtures/answers-matrix-10.csv`. Định dạng bốn cột `exam_code,number,correct_answer,points` vẫn nhập được qua lựa chọn bố cục theo dòng.
4. **Chấm phiếu:** chọn kỳ thi, xác nhận nếu dùng mẫu thử nghiệm; chụp/tải ảnh. Ứng dụng tìm 4 mốc đen hình vuông. Kiểm tra vị trí; nếu cần chọn thủ công theo thứ tự trái trên → phải trên → phải dưới → trái dưới, rồi căn chỉnh và nhận diện.
5. QR chỉ được đọc dưới dạng JSON theo schema; không tự mở URL hoặc thực thi nội dung. QR sai schema/sai kỳ thi phải chụp lại. Không có QR thì phải tích chọn tiếp tục thủ công. SBD và mã đề được đọc từ các cột tô nếu template khai báo, sau đó đối chiếu QR/danh sách lớp.
6. Xem ảnh có overlay, chỉnh từng câu hoặc xác nhận giữ nguyên. Câu tô mờ/không rõ phải được sửa hoặc xác nhận; nhiều ô cần xác nhận riêng và được 0 điểm. Chọn học sinh và mã đề rõ ràng, tích xác nhận, rồi lưu.
7. Server cấp draft/idempotency ID, upload hai ảnh, kiểm tra cả hai đã tồn tại, tự tính điểm từ đáp án chuẩn trong transaction rồi lưu câu trả lời, lịch sử và audit. Không tin tổng điểm từ trình duyệt. Mất mạng: bản đã xác nhận và hai ảnh được giữ trong hàng đợi IndexedDB; vào **Kết nối & đồng bộ** để gửi lại cùng ID.
8. **Báo cáo:** lọc thời gian/lớp/môn/kỳ thi/mã đề/người chấm; xuất CSV UTF-8 có BOM/XLSX; mở ảnh và lịch sử. Chấm lại yêu cầu lý do và kiểm tra revision để tránh ghi đè thay đổi đồng thời. Có danh sách QR/SBD lỗi và thao tác đánh dấu đã xử lý.

Camera dùng input `capture="environment"`, mở camera hoặc bộ chọn ảnh tùy thiết bị. Truy cập từ điện thoại cần một máy chủ HTTPS có thể truy cập từ điện thoại. `localhost` trên điện thoại là chính điện thoại đó; cần triển khai hoặc dùng HTTPS tunnel của bạn. Ảnh hỗ trợ PNG/JPEG/WebP, tối đa 20 MB đầu vào và 50 megapixel. Ảnh gốc giữ đầy đủ pixel sau khi áp dụng chiều EXIF, được mã hóa PNG; metadata EXIF/tệp JPEG gốc không được giữ. Ảnh xử lý giới hạn cạnh dài 2400 px trước khi chuẩn hóa theo template.

## Kiểm thử

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:db
npm.cmd run fixtures
npm.cmd run test:browser
npm.cmd run test:import
npm.cmd run build
```

`test:db` chạy **migrations và RLS thật** trong PostgreSQL WebAssembly (PGlite). Schema `auth` và Storage metadata được mô phỏng; kiểm tra quyền được thực thi dưới role `authenticated` với UUID khác nhau. Không cần Docker. Tùy chọn `TEST_DATABASE_URL` chỉ dành cho một PostgreSQL rỗng, có thể bỏ đi, cho phép tạo role/schema; **không trỏ công cụ kiểm thử này vào Supabase hoặc database đang có dữ liệu**.

`test:browser` mở Chrome headless sẵn trên Windows với profile tạm, tạo lớp/kỳ thi qua UI, đọc ảnh/QR bằng thư viện thật, lưu ảnh/điểm, mở báo cáo, xuất CSV và kiểm tra giao diện 390 px. Có thể đặt `CHROME_PATH` để dùng đường dẫn Chrome/Chromium khác. Screenshots nằm trong `artifacts/`. Không cài hoặc tải trình duyệt tự động.

`test:import` kiểm tra nhập bảng Excel/CSV, đối chiếu tất cả đáp án sau khi lưu và tải mẫu, chặn mã đề trùng và giữ định dạng CSV theo dòng. Có thể đặt `ANSWER_IMPORT_FILE` thành đường dẫn XLSX để kiểm tra bằng tệp riêng; công cụ không chụp hoặc công khai nội dung đáp án của tệp đó.

Ảnh mẫu tái tạo bằng `npm.cmd run fixtures` tại `public/fixtures`: hai mẫu 20/40 câu × ảnh rõ, phối cảnh/ánh sáng lệch, bỏ trống/nhiều ô/nghi ngờ; kèm đáp án CSV/XLSX/JSON. QR của ảnh gốc dùng ID kỳ thi tổng hợp cố định; khi thử thủ công với kỳ thi mới, cần tạo QR theo ID mới hoặc dùng ảnh không QR. Kiểm thử trình duyệt tự tạo QR đúng ID kỳ thi vừa tạo. Không có dữ liệu/điểm học sinh giả được tự chèn vào dashboard.

## Phạm vi và triển khai

Hỗ trợ chấm có trọng số cho các phần `mcq`, 2–5 lựa chọn, một đáp án đúng. Cấu trúc schema có phiên bản; loại câu khác chưa được hỗ trợ và bị từ chối. Quy tắc hiện tại: đúng nhận điểm câu, sai/bỏ trống/nhiều ô được 0, làm tròn 4 chữ số. Không tự nhận dạng đúng/sai nhiều ý hoặc câu trả lời số của các mẫu khác.

Đã kết nối cấu hình Supabase và kiểm tra endpoint Auth/REST như mô tả phía trên. Chưa có ảnh chụp từ bản in TN - DO trên thiết bị thật hoặc tài khoản thử nghiệm được cấp; chưa công bố độ chính xác nhận diện thực tế hay xác nhận luồng upload Supabase của một tài khoản thật. Cần kiểm chứng các phần này trước khi dùng cho kỳ thi thật. Báo cáo chi tiết: [docs/DELIVERY.md](docs/DELIVERY.md).

Build tạo `dist/`, có thể triển khai lên dịch vụ HTTPS tĩnh. Điền biến `VITE_*` khi build; chúng là cấu hình public. Kiểm tra migrations trên môi trường staging trước, tạo tài khoản từng vai trò và kiểm thử truy cập chéo tổ chức bằng API. Không có Service Role Key trong mã nguồn frontend.

## Tài liệu kỹ thuật

- [Kiến trúc và phân quyền](docs/ARCHITECTURE.md)
- [Định dạng dữ liệu và hiệu chỉnh mẫu](docs/FORMATS.md)
- [JSON Schema đáp án](docs/answer-key.schema.json), [QR](docs/qr.schema.json), [template](docs/template.schema.json). JSON Schema mô tả cấu trúc; Zod và server còn kiểm tra tổng điểm, câu trùng, tính liên tục, đúng số lựa chọn và phiên bản.
- Cơ sở triển khai: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [OpenCV perspective transformations](https://docs.opencv.org/4.x/dd/d52/tutorial_js_geometric_transformations.html), [SheetJS Node/ESM](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [Zod schemas](https://zod.dev/api).

# Báo cáo bàn giao · 18/10/2026

Đã khởi tạo dự án trong `D:\cham-tn` vì thư mục ban đầu trống, không có repository/mã nguồn cần bảo toàn. Mã nguồn React/TypeScript, lockfile, `.env.example`, migrations, chính sách RLS, assets OpenCV tái tạo từ npm, fixtures và hướng dẫn đều có trong workspace.

## Cập nhật TN - DO và phiếu ba phần

- Đổi thương hiệu thành **TN - DO** trong giao diện, tiêu đề trang, package và tài liệu. Chỉ ghi nhận ý tưởng từ TNMaker tại trang giới thiệu; không dùng ảnh tham chiếu hay logo của nguồn đó trong phiếu in.
- Thiết kế riêng `TNDO-A20` (2 nhóm) và `TNDO-A40` (4 nhóm), QR cuối trang. Có PDF/SVG A4, fixtures được tạo từ chính bản thiết kế để kiểm tra OMR.
- Thêm **TNDO-3P-2026**, gồm 40 câu trắc nghiệm, 8 câu đúng–sai × 4 ý và 6 câu trả lời ngắn × 4 cột số. Có PDF/SVG/PNG và JSON tọa độ tại `public/forms`. Mẫu này phục vụ in; bộ chấm đúng–sai/trả lời ngắn chưa được tích hợp, không được đưa vào bộ chọn chấm MCQ.
- Giữ dữ liệu và ảnh cũ qua bước chuyển IndexedDB, giữ phiên bản template cũ bất biến; mẫu mới có ID riêng.
- Cấu hình Supabase đã được đọc từ dữ liệu người dùng nhập và chuyển sang `.env` được bỏ qua trong Git. Auth HTTP 200, email bật; bảng mẫu và năm RPC chính phản hồi đúng trạng thái từ chối khóa ẩn danh. Chưa dùng tài khoản thật để kiểm tra upload hoặc chạy SQL quản trị.
- Đã đăng ký Site riêng tư tên TN - DO tại `https://tn-do.livelyboot512.chatgpt.site`. Phản hồi xuất bản được ghi riêng vào `artifacts/deployment.json` để phân biệt đăng ký với triển khai thành công.

## Chức năng đã triển khai

| Nhóm | Kết quả |
| --- | --- |
| Ứng dụng | Dashboard tiếng Việt, giao diện desktop/điện thoại, trạng thái rỗng từ dữ liệu thật, màn hình Auth/tổ chức |
| Lớp/học sinh | Tạo lớp, phân công giáo viên, thêm danh sách trực tiếp/CSV/XLSX với xác nhận, kiểm tra SBD trùng, tìm kiếm và xuất CSV |
| Kỳ thi/đáp án | Nhiều kỳ thi/mã đề/phần MCQ 2–5 lựa chọn, lưới nhập bằng bàn phím, kiểm tra tổng điểm/câu trùng/cấu trúc, lưu phiên bản bất biến |
| Import | CSV UTF-8/XLSX có ánh xạ cột, xem trước và lỗi theo dòng; JSON 1.0 có Zod và JSON Schema; mẫu tải xuống |
| Template | Tạo/sao chép/import/export JSON, phiên bản, mốc/vùng SBD/mã đề/QR/từng ô/ngưỡng riêng, thử ảnh/overlay/hiệu chỉnh bằng chạm, kích hoạt có xác nhận ảnh thực |
| QR | BarcodeDetector và ZXing dự phòng, schema strict, đọc vùng QR sau căn chỉnh và toàn ảnh, đối chiếu exam/template/SBD/code, giải UUID tham chiếu tại server |
| Ảnh và OMR | Camera qua capture input/tải ảnh, EXIF orientation, tìm mốc vuông/chọn thủ công, homography, adaptive threshold, tỷ lệ tô từng ô, nhận diện chữ số theo cột |
| Xác minh/chấm | Chỉnh lựa chọn từng câu, giữ nguyên/đánh dấu đã kiểm tra, 5 trạng thái đúng/sai/trống/nhiều ô/cần xác minh, tính điểm có trọng số và chặn chưa xác minh |
| Cloud | Supabase Auth, 23 bảng riêng tư, RLS/ACL, membership và phân công, khóa ngoại theo tenant, private Storage, tính điểm server, lưu lịch sử và audit |
| Phục hồi | Draft upload, hàng đợi Blob IndexedDB theo tài khoản/tổ chức, gửi lại cùng UUID, chống trùng theo kỳ thi/học sinh, finalize và chấm lại trong transaction |
| Thành viên | Mã mời một lần/hạn 7 ngày, tham gia nhiều tổ chức, đổi vai trò, phân công/thu hồi lớp-kỳ thi, bảo vệ quản trị viên cuối cùng |
| Báo cáo | Bộ lọc lớp/kỳ thi/môn/mã đề/ngày/người chấm, trung bình/min/max/phân bố, ảnh/histories, chấm lại có lý do/revision, danh sách lỗi QR/SBD và đánh dấu xử lý, CSV BOM/XLSX |

## Kiểm chứng

- `npm.cmd run typecheck`: TypeScript strict.
- `npm.cmd run lint`: ESLint và React Hooks.
- `npm.cmd test`: bộ kiểm thử cho Zod, đáp án nhiều mã, tổng điểm có trọng số, CSV/XLSX/JSON, QR, template, OMR pixel, review, phiên bản, lưu ảnh, idempotency, upload gián đoạn, chuyển dữ liệu cũ và thiết kế phiếu TN - DO. Số lượng/kết quả lần chạy cuối nằm trong `artifacts/verification.txt`.
- `npm.cmd run test:db`: **53 kiểm tra đạt**, chạy migrations trong PostgreSQL WebAssembly, kiểm tra RLS/grants thật dưới nhiều UUID/role. Bao gồm cách ly tổ chức/lớp, quyền viewer/examiner, chống nâng quyền, upload thiếu ảnh, điểm giả từ client, version/regrade/concurrency, lời mời, review issues và private bucket.
- `npm.cmd run test:browser`: Chrome thật, tạo lớp/học sinh/kỳ thi bằng UI; composite QR theo ID mới; OpenCV/ZXing thật đọc đúng SBD `000001`, mã `101` và 20 câu; xác nhận/lưu ảnh + điểm; mở lại ảnh, xuất CSV; tải lại vẫn còn dữ liệu; menu ở 390 px; không tràn ngang/ngoại lệ JS. Kiểm tra 6 PNG tổng hợp của hai mẫu 20/40 câu: rõ, phối cảnh/ánh sáng lệch và câu trống/nhiều ô/nghi ngờ.
- `npm.cmd run build`: tạo bản tĩnh trong `dist`, chia tải công cụ theo màn hình, OpenCV chỉ tải khi cần nhận diện. Cảnh báo annotation từ dependency Zod không ảnh hưởng build; SheetJS là thư viện lớn được tải ở màn hình import/export.

Screenshots trong `artifacts/dashboard-desktop.png`, `dashboard-mobile.png`, `scan-review-desktop.png`. Dữ liệu của kiểm thử trình duyệt nằm trong context tạm, không được nạp sẵn vào ứng dụng của người dùng. Kết quả kiểm tra cục bộ được ghi thêm trong `artifacts/verification.txt`.

## Giới hạn còn lại

1. **Kiểm chứng Supabase:** đã có URL/anon key và kiểm tra được endpoint thật. Chưa có tài khoản đăng nhập hoặc quyền SQL quản trị để kiểm tra đầy đủ Auth/Storage/RLS trên dữ liệu thật. Migrations và phân quyền được kiểm thử riêng trong PostgreSQL WASM.
2. **Chưa có ảnh phiếu in thực tế:** hai mẫu phát triển vẫn inactive/thử nghiệm. Không cam kết tương thích mọi mẫu hoặc đưa ra tỷ lệ chính xác thực tế. Người dùng phải hiệu chỉnh từ ảnh mẫu thật và đánh giá bộ ảnh độc lập.
3. **Loại câu:** triển khai weighted MCQ một đáp án đúng, 2–5 lựa chọn/phần; chưa có chấm đúng/sai nhiều ý, câu số ngắn hoặc OCR chữ viết tay. Các loại không hỗ trợ bị từ chối bằng schema.
4. **Camera:** đã kiểm tra upload/capture file trong Chrome headless; chưa kiểm tra camera vật lý và các trình duyệt điện thoại thật. Đích triển khai cho điện thoại cần HTTPS.
5. **Mời/QR hàng loạt:** mã mời được tạo và nhập trong UI, không gửi email tự động. Tham chiếu QR được tạo/xác thực qua RPC; chưa có giao diện in/phát hành QR hàng loạt.
6. **Dữ liệu đang chờ:** Blob chưa upload nằm trên thiết bị. Không có đồng bộ nền khi ứng dụng đóng hoặc phục hồi Blob sau khi xóa dữ liệu trình duyệt. Thay template sau khi đã chấm yêu cầu quét lại; chức năng chấm lại hiện chỉ áp dụng cùng template version, giữ ảnh cũ bất biến.

Hướng dẫn chạy, cấu hình và triển khai HTTPS nằm trong [README](../README.md); cấu trúc/RLS trong [ARCHITECTURE](ARCHITECTURE.md); dữ liệu/hiệu chỉnh trong [FORMATS](FORMATS.md).

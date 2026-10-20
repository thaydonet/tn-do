# Kiến trúc và kiểm soát dữ liệu

`src/domain` chứa các module độc lập: `qr-reader`, `template-matcher`, `image-preprocessor`, `omr-engine`, `answer-key-resolver`, `grading-engine`, `result-review`, `submission-storage`, `review-issues`, import và báo cáo. `src/ui` quản lý tương tác; `src/lib` quản lý Supabase và IndexedDB. Mỗi tọa độ xử lý ảnh được đọc từ cấu hình template, không nằm trong thuật toán OMR.

OpenCV tải lười từ asset cùng origin; phát hiện contour đen gần hình vuông, chọn ứng viên gần bốn góc; người dùng kiểm tra hoặc chọn lại tâm mốc. `getPerspectiveTransform` ánh xạ mốc ảnh tới mốc template, `warpPerspective` chuẩn hóa kích thước, grayscale và adaptive threshold xử lý ánh sáng không đều. OMR đo tỷ lệ pixel đen trong đĩa bán kính 65% bán kính ô, tránh viền. Ngưỡng filled/ambiguous/min_gap riêng từng template phân loại rõ, bỏ trống, nhiều ô và cần xác minh. Đây là bộ nhận diện dựa trên mốc vuông, không phải nhận diện tổng quát mọi bố cục phiếu.

## Phiên bản và lưu bài

`exams` và `answer_sheet_templates` là định danh ổn định. `exam_versions` và `template_versions` bất biến đối với client. Mỗi lần lưu tạo phiên bản kế tiếp dưới row lock; phiên bản đáp án gắn chính xác template version và grading rule. `exam_codes`, `exam_questions`, `answer_keys` chuẩn hóa từ document đã kiểm tra; tính điểm ở server đọc những bảng này, không dùng đáp án gửi trong yêu cầu chấm.

Một bài có duy nhất `(exam_id,student_id)`; UUID của lần chụp là khóa idempotency. `begin_submission` tạo hoặc trả lại draft cho cùng người chấm/thông tin. Metadata đã thay đổi với cùng khóa bị từ chối. Blob chỉ upload vào hai đường dẫn do server cấp. Upload immutable; khi gửi lại, lỗi “already exists” chỉ áp dụng cùng đường dẫn draft. `finalize_submission` khóa row, kiểm tra đủ hai đối tượng Storage, xác minh câu trả lời rồi tính/lưu điểm, câu trả lời, history và audit trong một transaction. Finalize lặp lại trả kết quả cũ.

Hàng đợi giữ phiên bản đáp án/template, marks đã xác nhận và hai Blob trước khi bắt đầu upload. Hàng đợi giới hạn bởi `organization_id` và `user_id`; tài khoản khác không tự gửi được. Gửi lỗi giữ nguyên dữ liệu, thử lại cùng UUID. Bản chờ đã tồn tại không được ghi đè bằng ảnh/marks mới. Khi đổi thiết bị hoặc xóa dữ liệu trình duyệt, Blob chưa upload không thể phục hồi; draft cloud vẫn giữ trạng thái uploading. Không có background sync khi ứng dụng đã đóng.

Chấm lại chỉ dùng ảnh/các lựa chọn đã xác nhận, template version phải giữ nguyên. Caller chọn phiên bản đáp án, cung cấp lý do và revision mong đợi. Transaction lưu score và snapshot cũ trong lịch sử, tăng revision; không tự đổi điểm khi có đáp án mới. Nếu template khác phải chụp lại; hiện UI báo lỗi và không ghi đè ảnh cũ.

## Quyền

| Vai trò | Phạm vi |
| --- | --- |
| platform_admin | DBA cấp, xem/quản lý mọi tổ chức |
| school_admin | Thành viên, phân công, lớp, kỳ thi, template và báo cáo trong tổ chức |
| teacher | Lớp được phân công; kỳ thi theo lớp, do mình tạo hoặc được giao; tạo/sửa đáp án khi có quyền lớp; chấm/xem báo cáo |
| examiner | Xem dữ liệu và chấm kỳ thi được giao; không sửa đáp án/template hoặc danh sách lớp |
| viewer | Chỉ metadata/báo cáo/ảnh thuộc kỳ thi được giao; không đọc answer key hoặc chỉnh kết quả |

Mọi bảng riêng tư bật RLS; client không có quyền INSERT/UPDATE/DELETE vào bảng dữ liệu. RPC `SECURITY DEFINER` cố định `search_path=''`, kiểm tra `auth.uid()`/membership/phân công và sử dụng tên bảng đầy đủ. Các hàm nội bộ không được cấp EXECUTE cho anon/authenticated. Bảng nối có khóa ngoại tổng hợp theo tổ chức, không thể gắn child vào parent khác tenant.

`get_workspace` trả dữ liệu theo quyền; viewer chỉ nhận metadata đề và kết quả, không nhận document đáp án. Câu trả lời đã lưu/lịch sử chứa số điểm và trạng thái nhưng không chứa khóa đáp án đúng. Private bucket có RLS theo draft/submission và quyền kỳ thi; không dùng public URL. Audit ghi actor lấy từ JWT, không nhận actor do client tự khai.

Quyền giao diện giúp giảm thao tác không phù hợp; quyền thực tế nằm trong RLS, table grants và RPC. Giới hạn: quản trị hạ tầng/Postgres service role luôn có thể vượt RLS; giữ chúng ngoài frontend. Các thiết lập Auth/Storage gateway của Supabase cần thêm kiểm thử staging ngoài bộ PostgreSQL WASM.

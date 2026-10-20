# Đáp án, QR và cấu hình mẫu

## JSON đáp án 1.0

Ví dụ đầy đủ: `public/fixtures/answers-20.json`. Mỗi `answer_sheet` là một mã đề. Mỗi phần khai báo `type: "mcq"`, `title`, `choices` (2–5), và danh sách `number`, `correct_answer`, `points`. Số câu duy nhất và liên tục từ 1 trên toàn mã đề; tổng points bằng `exam.grading_scale`. Không dùng điểm cố định hoặc tự chia lại điểm khi nhập sai tổng.

Số câu của đề có thể nhỏ hơn hoặc bằng sức chứa mẫu phiếu. Ví dụ đề 10 câu dùng phiếu 20 hoặc 40 câu, chỉ khai báo câu 1–10 và điểm tương ứng (10 câu × 1 điểm cho thang 10). Vị trí ô và số lựa chọn phải khớp mẫu. Chỉ nhận diện các câu có trong đáp án của kỳ thi; khi chọn mã đề, chỉ xác minh, tính điểm và lưu các câu của mã đề đó. Các ô ngoài đề không ảnh hưởng kết quả, kể cả tô mờ hoặc nhiều ô.

Trường `class_id` của kỳ thi có thể là `null` khi không chọn lớp. Khi chấm, có thể chọn học sinh từ danh sách được phép truy cập trong cùng tổ chức; bài chấm vẫn lưu lớp thực tế của học sinh để báo cáo. Kỳ thi có lớp chỉ nhận học sinh trong lớp đó.

CSV/XLSX hỗ trợ bảng có **hàng đầu là mã đề, cột đầu là số câu**:

```csv
Câu,101,102,103,104
1,A,B,C,D
2,B,C,D,A
```

Ô góc trên trái có thể trống hoặc ghi tên như `Câu/mã đề`. Mỗi cột đáp án tạo một mã đề, giữ thứ tự cột trong tệp; các mã phải khác nhau. Mỗi mã có đáp án A–D đầy đủ cho các câu liên tục từ 1. Điểm chia đều từ thang điểm đang chọn: 10 câu trên thang 10 được 1 điểm/câu. Ứng dụng xem trước bảng, báo lỗi theo dòng/mã đề/câu và chỉ áp dụng khi giáo viên xác nhận. Nút tải mẫu XLSX/CSV xuất cùng bố cục này. Mẫu 4 mã đề × 10 câu: `public/fixtures/answers-matrix-10.csv`.

Định dạng mỗi dòng một câu vẫn được hỗ trợ, với bốn cột mặc định `exam_code,number,correct_answer,points`; có thể ánh xạ tên cột khác và giữ trọng số từng câu. Ứng dụng tự nhận diện bố cục, có bộ chọn để đổi thủ công. Cả hai dạng mặc định một phần 4 lựa chọn A–D; các câu được sắp theo số.

Tệp Excel đọc sheet đầu, tối đa 10 MB. CSV UTF-8 hỗ trợ BOM, dấu phẩy/ngoặc kép chuẩn và dấu chấm phẩy do Papa Parse phát hiện. Bảng đáp án giữ mã đề dạng Text hoặc định dạng số có số 0 ở đầu (ví dụ `001`); số 0 đã bị Excel bỏ thì không tự suy đoán lại. SBD trong danh sách học sinh nên lưu dạng Text. Phần mở rộng lựa chọn hoặc nhiều phần dùng JSON hoặc lưới trực tiếp.

## QR metadata 1.0

```json
{
  "schema_version": "1.0",
  "exam_id": "20000000-0000-4000-8000-000000000001",
  "template_id": "10000000-0000-4000-8000-000000000020",
  "template_version": 1,
  "exam_code": "101",
  "student_number": "000001"
}
```

Chỉ `schema_version` và `exam_id` bắt buộc. Các trường khác tùy chọn, `reference` có thể chứa UUID tham chiếu server. Không cho phép trường chưa định nghĩa, URL hoặc đáp án. BarcodeDetector được thử trước nếu khả dụng, ZXing dự phòng. Không đọc được QR là trạng thái riêng với QR đã đọc nhưng không hợp lệ; chỉ trường hợp không đọc được mới cho phép lựa chọn tiếp tục thủ công.

RPC `create_sheet_reference(p_exam,p_student,p_code)` tạo UUID riêng. RPC `validate_sheet_reference` chỉ trả thông tin khi người chấm được giao kỳ thi, đối chiếu exam/SBD/code. UI hỗ trợ giải tham chiếu; việc in/phát hành QR hàng loạt chưa có giao diện. Không đưa khóa đáp án vào QR phát cho học sinh.

## Template

`public/fixtures/template-20.json` và `template-40.json` là ví dụ. `anchors` theo thứ tự TL,TR,BR,BL. Tất cả x/y chuẩn hóa 0–1; radius theo chiều rộng. Mỗi câu khai báo vị trí từng ô và nhãn A–E. Vùng số báo danh/mã đề là danh sách cột; mỗi cột chứa đúng 10 ô 0–9. `qr_region` là metadata vùng QR; reader hiện đọc toàn ảnh để không bỏ sót QR ngoài vùng.

Trong trình thử mẫu: áp dụng JSON → tải ảnh → kiểm tra/chọn 4 mốc → căn chỉnh/nhận diện → xem overlay → chọn câu/nhãn → bật hiệu chỉnh bằng chạm → chạm tâm ô → chạy thử lại. Tọa độ các vùng chữ số/mốc và bán kính chỉnh qua JSON. Cần áp dụng thay đổi JSON trước khi lưu. Mỗi lần hiệu chỉnh mẫu có sẵn tạo phiên bản mới; không sửa tọa độ của bài đã chấm.

Chỉ cho kích hoạt khi đã chạy thử và quản trị viên xác nhận ảnh thật; hệ thống lưu phiên bản đã kiểm tra và ghi chú. Xác nhận là thao tác con người, không phải chứng nhận độ chính xác tự động.

## Bộ chuẩn ảnh thực tế

Tạo manifest riêng với template ID/version, đường dẫn ảnh, SBD, mã đề và lựa chọn đúng theo từng câu do người đối soát nhập. Tách ảnh dùng hiệu chỉnh khỏi ảnh đánh giá; bao gồm ít nhất các thiết bị/độ phân giải, xoay, nghiêng, bóng đổ, tô nhạt, tẩy xóa, bỏ trống và nhiều ô. Đo riêng tỷ lệ chọn đúng template, đọc đúng SBD/mã đề, từng ô, từng phiếu và tỷ lệ cần người xác minh. Không gộp tỷ lệ trên ảnh tổng hợp thành độ chính xác thực tế. Hiện chưa có tập ảnh thực trong workspace nên chưa có các số đo này.

# Chấm phiếu TN - DO 2026 ba phần

## Dùng bộ phiếu hiện tại

Kỳ thi mới mặc định chọn **TNDO-A20 v2**. Chọn **TNDO-A40 v2** cho phiếu 40 câu hoặc **TNDO-3P-2026 v3** cho phiếu ba phần. Mã và phiên bản được in ở đầu cả ba phiếu; các tệp không có hậu tố phiên bản trong `public/forms` luôn trỏ đến bộ in hiện tại.

Nếu kỳ thi đã tạo bằng mẫu cũ, vào **Chấm phiếu**, chọn kỳ thi và bấm **Dùng phiếu mới nhất** trước khi đưa phiếu mới vào nhận diện. Thao tác này tạo phiên bản kỳ thi mới với cùng đáp án và mẫu in hiện tại. Ảnh, điểm và phiên bản của bài đã chấm vẫn được giữ nguyên. Mẫu chưa được kiểm chứng bằng ảnh thực vẫn yêu cầu xác nhận sử dụng. Nếu chưa có mẫu mới trong tổ chức, quản trị viên vào **Thư viện mẫu phiếu** để bổ sung bộ mẫu; Supabase cần migration `202610200003_large_print_templates.sql` như hướng dẫn bên dưới.

Kiểm tra trọn luồng chuyển mẫu và chấm trực tiếp các PNG/JSON trong `public/forms` bằng `npm.cmd run test:forms-flow`. Chạy `npm.cmd run forms:print` sau khi thay đổi trình tạo phiếu để đồng bộ PDF/SVG/PNG/JSON.

## Bộ phiếu A4 lề 2,5 cm, ô tô lớn

Bộ in mới gồm **TNDO-A20 v2**, **TNDO-A40 v2** và **TNDO-3P-2026 v3**. Bốn ô vuông định vị trên camera có cạnh lớn gấp 3. Trên cả ba mẫu in, mốc đen có cạnh 5,25 mm (gấp 1,5); đường kính ô tô SBD/mã đề tăng gấp đôi: 4,872 mm cho phiếu 20/40 câu, 3,78 mm cho phiếu ba phần. Các hàng/cột đã được giãn và bố trí lại, không chồng ô. Mọi tọa độ OMR dùng cùng nguồn với bản in.

PDF A4 có sẵn lề **trên, dưới, trái, phải 25 mm**, tính đến mép ngoài bốn mốc đen. Khi in chọn **A4, tỷ lệ 100%**, không thêm lề hoặc co vừa trang lần nữa. Tải [phiếu 20 câu](../public/forms/TNDO-A20.pdf), [phiếu 40 câu](../public/forms/TNDO-A40.pdf), [phiếu ba phần](../public/forms/TNDO-3P-2026.pdf). Có bản kèm phiên bản `-v2` / `-v3`, SVG, PNG và JSON cấu hình nhận diện trong `public/forms/`.

Với Supabase, áp dụng thêm `supabase/migrations/202610200003_large_print_templates.sql` sau các migration trước, rồi bấm **Thêm bộ phiếu TN - DO…** trong thư viện mẫu hoặc **Bổ sung mẫu phiếu…** trong màn hình tạo kỳ thi. Chọn đúng **20/40 câu v2** hoặc **TN - DO 2026 v3** trước khi dùng bản in mới. Dữ liệu cục bộ tự bổ sung phiên bản mới. Tọa độ phiên bản cũ và kỳ thi đã có được giữ nguyên; phiếu in cũ phải chấm với cấu hình cũ. Phiên bản mới là bản nháp cho đến khi kiểm thử ảnh thực và kích hoạt; có thể xác nhận dùng bản nháp tại màn hình chấm để kiểm tra.

Tạo lại cả ba bộ in bằng `npm.cmd run forms:print` (`forms:mixed` cũng chạy cùng bộ tạo). Kiểm tra hình học bằng `npm.cmd run test:print`: đọc trực tiếp PNG đã xuất, kiểm tra lề, phiếu trắng, toàn bộ đáp án và SBD/mã đề trên ảnh thẳng và ảnh nghiêng. `npm.cmd run test:camera` dùng mẫu 20 câu v2 mới để kiểm tra chấm liên tục.

## Phiên bản ba phần trước đây

Áp dụng migration `supabase/migrations/202610200002_three_part_grading.sql` sau các migration trước đó, rồi deploy frontend. Trong cửa sổ tạo kỳ thi hoặc thư viện mẫu, quản trị viên bấm **Bổ sung mẫu phiếu TN - DO còn thiếu** để thêm phiên bản v2. Kỳ thi đã dùng v1 vẫn giữ nguyên cấu hình và lịch sử điểm.

Chọn **TN - DO 2026 · v2**, bấm **Thêm phần II và III**, rồi nhập đáp án. Cấu hình ban đầu phân bổ 30% điểm cho phần I, 40% cho phần II và 30% cho phần III. Có thể đổi số câu và điểm mỗi câu; tổng điểm từng mã đề phải bằng thang điểm.

- Phần I: tối đa 40 câu A–D.
- Phần II: tối đa 8 câu, mỗi câu bốn ý a–d. Mặc định đúng 1/2/3/4 ý được 10%/25%/50%/100% điểm tối đa của câu. Có thể chuyển sang chia đều cho bốn ý. Ý bỏ trống không được tính là đúng.
- Phần III: tối đa 6 câu, mỗi câu bốn cột chữ số. Hỗ trợ số âm và dấu thập phân; các chữ số phải liên tiếp. Tô dấu âm và dấu thập phân ở hàng riêng. Không tô một chữ số ở nhiều ô cùng cột.

SBD gồm 8 chữ số, mã đề gồm 4 chữ số. Khai báo đúng cả số 0 ở đầu, ví dụ `0101`. Chọn **Sửa mã đề** để sửa mã mặc định khi cần.

Trong JSON và tệp nhập, câu phần I dùng số 1–40, phần II dùng số nội bộ 41–48 (hiển thị II.1–II.8), phần III dùng 49–54 (hiển thị III.1–III.6). Mỗi phần có thể ít câu hơn sức chứa phiếu, bắt đầu từ câu đầu của phần. Đúng–sai lưu bằng bốn ký tự T/F, ví dụ `TFTF`; trả lời ngắn lưu bằng chuỗi số, ví dụ `-1.25`. Dấu phẩy và dấu chấm thập phân được chấp nhận, số 0 thừa được chuẩn hóa khi chấm.

Tab Excel/CSV tải mẫu theo cấu hình hiện tại, giữ điểm và cách chấm từng phần. Cột câu dùng `II.1`, `III.1`; đáp án đúng–sai nhận `TFTF` hoặc `ĐSĐS`. Cần nhập đủ câu đã cấu hình; tệp thiếu câu sẽ không được áp dụng.

Phiếu không có QR cần chọn **Cho phép không có QR**. Ô mờ, tô kép, chữ số bị ngắt quãng hoặc dấu thập phân sai vị trí phải được xác minh. Có thể sửa từng ý đúng–sai và từng số trên màn hình chấm trước khi lưu. Supabase tự tính điểm từ đáp án được phân quyền, không nhận điểm do trình duyệt gửi làm kết quả chính thức. Chấm lại giữ lịch sử điểm cũ.

## Chụp và chấm liên tục bằng điện thoại

Trong **Chấm phiếu → chọn kỳ thi → Chụp bằng camera**, cho phép trình duyệt sử dụng camera. Camera sau mở ngay trong trang, kèm 4 ô vuông định vị theo mẫu phiếu đã chọn. Đưa 4 ô đen của giấy vào khung; từng ô chuyển xanh khi khớp. Giữ phiếu phẳng, ánh sáng đều và máy ổn định khoảng một giây để tự chụp.

Ứng dụng tự căn chỉnh, đọc QR (nếu có), SBD, mã đề và các câu thuộc kỳ thi. Khi xác định được một học sinh, mã đề hợp lệ và không có câu cần xác minh, ứng dụng tự chấm và lưu ảnh gốc, ảnh xử lý cùng kết quả. Camera tiếp tục mở; đưa phiếu vừa chấm ra khỏi khung ít nhất khoảng một giây rồi đặt phiếu tiếp theo vào. Không chụp lại cùng một phiếu khi vẫn giữ trong khung; bài của học sinh đã lưu hoặc đang chờ đồng bộ sẽ bị chặn lưu trùng.

Camera trực tiếp cho phép phiếu không có QR nếu đọc rõ SBD và mã đề. QR sai kỳ thi/phiên bản hoặc thông tin QR không khớp ô tô vẫn bị chặn. Thiếu SBD, mã đề hoặc có ô tô nghi ngờ thì camera dừng và mở phần xác minh. Chỉnh thông tin/câu trả lời rồi **Xác nhận & lưu kết quả** để tự quay lại camera; đưa phiếu cũ ra khỏi khung trước khi chấm tiếp.

Nếu lưu lên máy chủ thất bại, ảnh và kết quả đã nhận diện được giữ trong bản chờ trên thiết bị, camera dừng để người dùng kiểm tra. Gửi lại ở **Kết nối & đồng bộ**. Camera trực tiếp cần HTTPS (hoặc localhost khi phát triển); nếu thiếu quyền hoặc trình duyệt không hỗ trợ, dùng **Dùng camera hệ thống** hoặc chọn ảnh từ thiết bị. Luồng chọn ảnh vẫn nhận diện và xác nhận lưu thủ công như trước. Không cần migration mới cho tính năng camera này.

Kiểm tra: `npm run test:camera` chạy camera giả lập bằng luồng video canvas trong Chromium nhưng dùng OpenCV, OMR và IndexedDB thực tế; kiểm tra lệch khung, chụp tự động, lưu ảnh/điểm, không chụp lặp, chấm phiếu tiếp, xác minh thủ công và giải phóng camera. Cần kiểm tra thêm camera thật trên Safari iPhone và Chrome Android trước khi triển khai rộng.

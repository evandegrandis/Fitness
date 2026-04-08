import SwiftUI
import Combine

@Observable
class RestTimerModel {
    var isRunning = false
    var elapsed: TimeInterval = 0
    var targetSeconds: Int = 120
    private var timer: AnyCancellable?
    private var startDate: Date?

    var progress: Double {
        guard targetSeconds > 0 else { return 0 }
        return min(elapsed / Double(targetSeconds), 1)
    }

    var remainingFormatted: String {
        let remaining = max(0, Double(targetSeconds) - elapsed)
        let mins = Int(remaining) / 60
        let secs = Int(remaining) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    var elapsedFormatted: String {
        let mins = Int(elapsed) / 60
        let secs = Int(elapsed) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    var isOvertime: Bool {
        elapsed >= Double(targetSeconds)
    }

    func start(seconds: Int? = nil) {
        if let s = seconds { targetSeconds = s }
        startDate = Date()
        elapsed = 0
        isRunning = true
        timer = Timer.publish(every: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, let start = self.startDate else { return }
                self.elapsed = Date().timeIntervalSince(start)
            }
    }

    func stop() {
        timer?.cancel()
        timer = nil
        isRunning = false
    }

    func reset() {
        stop()
        elapsed = 0
    }
}

struct RestTimerView: View {
    @Bindable var timer: RestTimerModel
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .stroke(Color.accentColor.opacity(0.2), lineWidth: 4)

                Circle()
                    .trim(from: 0, to: timer.progress)
                    .stroke(
                        timer.isOvertime ? Color.orange : Color.accentColor,
                        style: StrokeStyle(lineWidth: 4, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Text(timer.remainingFormatted)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(timer.isOvertime ? .orange : .primary)
            }
            .frame(width: 48, height: 48)

            VStack(alignment: .leading, spacing: 2) {
                Text("Rest Timer")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(timer.isOvertime ? "Overtime" : "Resting")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(timer.isOvertime ? .orange : Color.accentColor)
            }

            Spacer()

            Button {
                timer.reset()
                onDismiss()
            } label: {
                Text("Skip")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.2), radius: 8, y: -2)
        }
        .padding(.horizontal)
    }
}

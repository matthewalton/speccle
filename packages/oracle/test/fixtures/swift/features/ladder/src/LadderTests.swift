import XCTest

final class LadderTests: XCTestCase {
  func test_LADDER_1_advancesByExactlyOneRung() {
    XCTAssertEqual(Ladder(rungs: 3).completeRung().current, 1)
  }
}

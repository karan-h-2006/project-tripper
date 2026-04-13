const MembersPanel = ({ tripData, currentUserId }) => {
  const members = Array.isArray(tripData?.members) ? tripData.members : [];
  const adminsFromArray = Array.isArray(tripData?.admins) ? tripData.admins : [];
  const admins = adminsFromArray.length
    ? adminsFromArray
    : tripData?.admin
      ? [tripData.admin]
      : [];

  const getUserId = (userLike) => {
    if (!userLike) return "";
    if (typeof userLike === "string") return userLike;
    return userLike?._id?.toString() || "";
  };

  const isAdmin = (userId) =>
    admins.some((admin) => getUserId(admin) === getUserId(userId));

  return (
    <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-900">Members</h2>
      <p className="mt-1 text-xs text-gray-500">People in this trip and their roles.</p>

      <div className="mt-4 space-y-2">
        {members.length === 0 ? (
          <p className="text-xs text-gray-500">No members found.</p>
        ) : (
          members.map((member) => (
            <div
              key={getUserId(member)}
              className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm text-gray-800 truncate">
                  {member?.username || "Unknown user"}
                </p>
                {getUserId(member) === getUserId(currentUserId) && (
                  <span className="text-xs text-gray-400">(You)</span>
                )}
              </div>

              {isAdmin(member) && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  Admin
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default MembersPanel;

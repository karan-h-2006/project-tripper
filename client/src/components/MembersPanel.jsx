import toast from "react-hot-toast";
import api from "../api/axios";

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

  const tripId = tripData?._id || tripData?.id;
  const isCurrentUserAdmin = admins.some(
    (admin) => getUserId(admin) === getUserId(currentUserId)
  );

  const handlePromote = async (memberId) => {
    try {
      await api.put(`/trips/${tripId}/promote/${memberId}`);
      toast.success("Member promoted to admin");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to promote member");
    }
  };

  const handleDemote = async (memberId) => {
    try {
      await api.put(`/trips/${tripId}/demote/${memberId}`);
      toast.success("Admin privileges removed");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to demote admin");
    }
  };

  const handleKick = async (memberId) => {
    try {
      await api.delete(`/trips/${tripId}/kick/${memberId}`);
      toast.success("Member removed from trip");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to remove member");
    }
  };

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
                {isAdmin(member) && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    Admin
                  </span>
                )}
              </div>

              {isCurrentUserAdmin &&
                getUserId(member) !== getUserId(currentUserId) && (
                  <div className="flex items-center gap-2">
                    {!isAdmin(member) && (
                      <button
                        type="button"
                        onClick={() => handlePromote(getUserId(member))}
                        className="rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                      >
                        Promote
                      </button>
                    )}
                    {isAdmin(member) && (
                      <button
                        type="button"
                        onClick={() => handleDemote(getUserId(member))}
                        className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        Demote
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleKick(getUserId(member))}
                      className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Kick
                    </button>
                  </div>
                )}
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default MembersPanel;

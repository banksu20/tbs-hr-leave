import LeaveRequestForm from "@/components/LeaveRequestForm";

interface LeaveRequestProps {
  userId?: string;
  userName?: string;
  initialLeaveType?: string;
  department?: string;
  pictureUrl?: string;
}

const LeaveRequest = ({ userId, userName, department, initialLeaveType, pictureUrl }: LeaveRequestProps) => {
  return (
    <LeaveRequestForm 
      userId={userId} 
      userName={userName} 
      initialLeaveType={initialLeaveType} 
      department={department}
      pictureUrl={pictureUrl}
    />
  );
};

export default LeaveRequest;